dl(){ curl -sL -o "raw/pl_items/$2.png" "https://api.pixellab.ai/mcp/objects/$1/download"; echo "$2 $(stat -c%s raw/pl_items/$2.png) $(file -b raw/pl_items/$2.png | cut -c1-40)"; }
dl 7638cde7-2f8f-4f33-898c-b2870053ccdb pickup_vacuum
dl 8111530b-43e6-4ef4-84c2-7a25fed50bb0 pickup_dollar
dl 5811d06e-2669-4445-aa51-66ae5c2c1282 pickup_cap
dl f6e621d6-b37b-4441-888f-722d66199af8 pickup_beer6
dl 0b0d4e6b-b57e-4060-b009-9313a2a52504 pickup_burger
dl 060392b0-0d93-4c8a-aeed-212dde01ed68 pickup_cash
dl 1e65e37e-99e4-4c26-b61d-b89a2f4ba719 pickup_coin
dl f48aaa7f-022a-4aa7-ae8f-2a334593dd71 proj_beer
dl 07f8a49d-dbce-4f4f-bac3-2de3446d2091 proj_golfball
dl 2d9fdb2f-e54e-462b-a51f-4318f4586342 proj_flag
dl 2b7c3c38-1d29-42ef-86ec-39bf0394cb90 proj_check
dl ca6d216a-89dd-4645-9ef9-0975dd3753a7 proj_coin
dl 1c0b40b6-5450-48a0-8a6e-06cd6019dd0d proj_log
dl a5c68220-1b70-44c6-89d0-b69f44528ea0 proj_whacker
dl b1e1a5ef-b272-460a-ac9d-fdb3f703bef2 proj_blade
dl 77609887-1fab-4948-a7a3-d2746e110352 proj_news
dl f6d683f7-d621-472a-b22c-0f1da1fb9ccf proj_dart
