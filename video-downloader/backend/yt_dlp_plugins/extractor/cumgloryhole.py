"""yt-dlp plugin extractor for cumgloryhole / gloryholeswallow.

These sites (cdn-cgh.ffemdom.com asset network) publish the real video stream
as an HLS ``.m3u8`` URL inside the page's schema.org JSON-LD ``contentURL``
field, and load the on-page player from an ``./video.html`` iframe. yt-dlp's
generic extractor doesn't recognize either, so it bails with "Unsupported URL".

This extractor claims the URL and resolves the stream in order of preference:

1. The JSON-LD ``contentURL`` HLS playlist on the main page (the common case).
2. An ``.m3u8`` / ``.mp4`` found inside the ``./video.html`` player iframe.
3. A classic KVS (``kt_player`` ``flashvars``) player, if a video on the
   network ever uses one.

The KVS deobfuscation helpers are lifted verbatim from yt-dlp's GenericIE so
behaviour tracks upstream.
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
    _VALID_URL = r'https?://(?:www\.)?(?:cumgloryhole|gloryholeswallow)\.\w+/(?:videos?|embed)/(?P<id>[^/?#&]+)'

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

        accum = 0
        for src in reversed(range(HASH_LENGTH)):
            accum += license_token[src]
            dest = (src + accum) % HASH_LENGTH
            indices[src], indices[dest] = indices[dest], indices[src]

        urlparts[3] = ''.join(hash_[index] for index in indices) + urlparts[3][HASH_LENGTH:]
        return urllib.parse.urlunparse(parsed._replace(path='/'.join(urlparts)))

    # ------------------------------------------------------------------------

    def _headers(self, referer):
        return {'User-Agent': self._UA, 'Referer': referer}

    def _formats_from_media_url(self, media_url, display_id, referer):
        """Turn a direct .m3u8/.mp4 URL into yt-dlp formats."""
        media_url = media_url.strip()
        headers = self._headers(referer)
        if '.m3u8' in media_url:
            return self._extract_m3u8_formats(
                media_url, display_id, 'mp4', m3u8_id='hls',
                headers=headers, fatal=False)
        return [{
            'url': media_url,
            'ext': 'mp4',
            'http_headers': headers,
        }]

    def _extract_kvs_formats(self, page, page_url, display_id):
        flashvars = self._search_json(
            r'(?s:<script\b[^>]*>.*?var\s+flashvars\s*=)',
            page, 'flashvars', display_id,
            transform_source=js_to_json, default=None)
        if not flashvars:
            return []
        license_code = flashvars.get('license_code')
        formats = []
        for key in filter(re.compile(r'^video_(?:url|alt_url\d*)$').match, flashvars):
            raw = flashvars[key]
            if not raw:
                continue
            format_id = flashvars.get(f'{key}_text', key)
            formats.append({
                'url': urljoin(page_url, self._kvs_get_real_url(raw, license_code)),
                'format_id': format_id,
                'ext': 'mp4',
                **(parse_resolution(format_id) or parse_resolution(raw)),
                'http_headers': self._headers(page_url),
            })
            if not formats[-1].get('height'):
                formats[-1]['quality'] = 1
        return formats

    def _real_extract(self, url):
        display_id = self._match_id(url)
        webpage = self._download_webpage(
            url, display_id, headers=self._headers(url))

        formats = []

        # 1) HLS/MP4 stream published in schema.org JSON-LD (note: this site
        #    spells it "contentURL"). This is the normal path.
        for m in re.finditer(
                r'content[Uu][Rr][Ll]"\s*:\s*"(?P<u>[^"]+\.(?:m3u8|mp4)[^"]*)"',
                webpage):
            formats.extend(self._formats_from_media_url(
                m.group('u').replace('\\/', '/'), display_id, url))

        # 2) Fall back to the player iframe (./video.html), which may itself
        #    carry the stream URL or a KVS player.
        if not formats:
            iframe = self._search_regex(
                r'<iframe[^>]+\bsrc=["\'](?P<u>[^"\']+)["\']',
                webpage, 'player iframe', group='u', default=None)
            if iframe:
                iframe_url = urljoin(url, iframe)
                iframe_page = self._download_webpage(
                    iframe_url, display_id, 'Downloading player iframe',
                    headers=self._headers(url), fatal=False) or ''
                for m in re.finditer(
                        r'["\'](?P<u>https?://[^"\']+\.(?:m3u8|mp4)[^"\']*)["\']',
                        iframe_page):
                    formats.extend(self._formats_from_media_url(
                        m.group('u').replace('\\/', '/'), display_id, iframe_url))
                if not formats:
                    formats.extend(self._extract_kvs_formats(
                        iframe_page, iframe_url, display_id))

        # 3) Last resort: a classic KVS player on the main page.
        if not formats:
            formats.extend(self._extract_kvs_formats(webpage, url, display_id))

        if not formats:
            raise ExtractorError(
                'Could not find a video stream on the page. The site layout '
                'may have changed - please report this.', expected=True)

        # De-duplicate identical stream URLs (JSON-LD + iframe can overlap).
        seen, deduped = set(), []
        for f in formats:
            key = (f.get('url'), f.get('format_id'))
            if key not in seen:
                seen.add(key)
                deduped.append(f)

        title = (
            self._og_search_title(webpage, default=None)
            or self._html_search_regex(
                r'<(?:h1|title)>(?:Video:\s*)?(.+?)</(?:h1|title)>',
                webpage, 'title', default=None)
            or display_id)

        return {
            'id': display_id,
            'title': title.strip(),
            'thumbnail': self._og_search_thumbnail(webpage, default=None),
            'description': self._og_search_description(webpage, default=None),
            'formats': deduped,
        }
