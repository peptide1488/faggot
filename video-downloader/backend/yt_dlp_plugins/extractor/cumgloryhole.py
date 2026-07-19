"""yt-dlp plugin extractor for cumgloryhole / gloryholeswallow.

These sites run on the KVS ("Kernel Video Sharing" / kt_player) engine, the
same one behind a huge number of tube sites. yt-dlp's generic extractor can
usually handle KVS, but its detection hinges on a strict ``kt_player.js?v=...``
regex and on the site serving the real player markup to yt-dlp's default
request. When either of those doesn't hold, extraction fails with
"Unsupported URL". A dedicated extractor sidesteps that: it always claims the
URL, fetches the page with browser-like headers + Referer, and decodes the
KVS-obfuscated stream directly.

The KVS URL-deobfuscation (`_kvs_get_license_token` / `_kvs_get_real_url`) is
lifted verbatim from yt-dlp's own GenericIE so behaviour tracks upstream. The
backend's retry ladder re-invokes this extractor with `impersonate` set when a
site is Cloudflare-fronted, so we don't hardcode impersonation here.
"""

import re
import urllib.parse

from yt_dlp.extractor.common import InfoExtractor
from yt_dlp.utils import (
    ExtractorError,
    js_to_json,
    parse_resolution,
    urljoin,
)


class CumgloryholeIE(InfoExtractor):
    IE_NAME = 'cumgloryhole'
    # Match the site the user hit (.se) plus its sibling domains / TLD mirrors;
    # these adult KVS networks rotate TLDs frequently.
    _VALID_URL = r'https?://(?:www\.)?(?:cumgloryhole|gloryholeswallow)\.\w+/(?:videos?|embed)/(?P<id>[^/?#&]+)'

    # A generous desktop UA; some KVS hosts serve a JS challenge / no player to
    # non-browser user agents.
    _UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
           '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')

    # --- KVS deobfuscation (verbatim from yt-dlp GenericIE) -----------------

    @staticmethod
    def _kvs_get_license_token(license_code):
        license_code = license_code.replace('$', '')
        license_values = [int(char) for char in license_code]

        modlicense = license_code.replace('0', '1')
        center = len(modlicense) // 2
        fronthalf = int(modlicense[:center + 1])
        backhalf = int(modlicense[center:])
        modlicense = str(4 * abs(fronthalf - backhalf))[:center + 1]

        return [
            (license_values[index + offset] + current) % 10
            for index, current in enumerate(map(int, modlicense))
            for offset in range(4)
        ]

    @classmethod
    def _kvs_get_real_url(cls, video_url, license_code):
        if not video_url.startswith('function/0/'):
            return video_url  # not obfuscated

        parsed = urllib.parse.urlparse(video_url[len('function/0/'):])
        license_token = cls._kvs_get_license_token(license_code)
        urlparts = parsed.path.split('/')

        HASH_LENGTH = 32
        hash_ = urlparts[3][:HASH_LENGTH]
        indices = list(range(HASH_LENGTH))

        # Swap indices of hash according to the destination calculated from
        # the license token.
        accum = 0
        for src in reversed(range(HASH_LENGTH)):
            accum += license_token[src]
            dest = (src + accum) % HASH_LENGTH
            indices[src], indices[dest] = indices[dest], indices[src]

        urlparts[3] = ''.join(hash_[index] for index in indices) + urlparts[3][HASH_LENGTH:]
        return urllib.parse.urlunparse(parsed._replace(path='/'.join(urlparts)))

    # ------------------------------------------------------------------------

    def _real_extract(self, url):
        display_id = self._match_id(url)
        webpage = self._download_webpage(
            url, display_id,
            headers={'User-Agent': self._UA, 'Referer': url})

        flashvars = self._search_json(
            r'(?s:<script\b[^>]*>.*?var\s+flashvars\s*=)',
            webpage, 'flashvars', display_id,
            transform_source=js_to_json, default=None)
        if not flashvars:
            raise ExtractorError(
                'Could not find the KVS player data on the page. The site may '
                'require login cookies (set COOKIES_FROM_BROWSER) or be serving '
                'a bot challenge.', expected=True)

        title = (
            self._html_search_regex(
                r'<(?:h1|title)>(?:Video: )?(.+?)</(?:h1|title)>',
                webpage, 'title', default=None)
            or self._og_search_title(webpage, default=None)
            or display_id)

        thumbnail = flashvars.get('preview_url')
        if thumbnail and thumbnail.startswith('//'):
            thumbnail = urljoin(url, thumbnail)

        license_code = flashvars.get('license_code')
        url_keys = list(filter(re.compile(r'^video_(?:url|alt_url\d*)$').match, flashvars.keys()))
        formats = []
        for key in url_keys:
            raw = flashvars[key]
            if not raw:
                continue
            format_id = flashvars.get(f'{key}_text', key)
            formats.append({
                'url': urljoin(url, self._kvs_get_real_url(raw, license_code)),
                'format_id': format_id,
                'ext': 'mp4',
                **(parse_resolution(format_id) or parse_resolution(raw)),
                'http_headers': {'Referer': url, 'User-Agent': self._UA},
            })
            if not formats[-1].get('height'):
                formats[-1]['quality'] = 1

        if not formats:
            raise ExtractorError(
                'KVS player found but no downloadable video URLs were present.',
                expected=True)

        return {
            'id': str(flashvars.get('video_id') or display_id),
            'display_id': display_id,
            'title': title,
            'thumbnail': thumbnail,
            'formats': formats,
        }
