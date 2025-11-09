#!/bin/bash

API_BASE="http://localhost:3000/api"
UUID="7f3562f4-bb3f-4ec7-89b9-da3b4b5ff250"
#UUID="69dc52b2-7f50-4c1c-adb9-0a6dbb574057b"
ID_NO="A123456789"

TOKEN=$(curl -s -X POST "${API_BASE}/auth/login" -H "Content-Type: application/json" -d "{\"uuid\":\"${UUID}\",\"idNo\":\"${ID_NO}\"}" | jq -r '.data.token')

curl -s -X POST "${API_BASE}/auth/register" -H "Content-Type: application/json" -d "{\"account\":\"testuser\",\"idNo\":\"B123456789\",\"name\":\"Test User\"}" | jq .
curl -s -X GET "${API_BASE}/auth/me" -H "Authorization: Bearer ${TOKEN}" | jq .
curl -s -X GET "${API_BASE}/places" -H "Authorization: Bearer ${TOKEN}" | jq .
curl -s -X GET "${API_BASE}/places/1" -H "Authorization: Bearer ${TOKEN}" | jq .
curl -s -X POST "${API_BASE}/route/plan" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d "{\"points\":[{\"id\":0,\"time\":\"2025-11-08T23:08:00:000000\",\"lat\":25.024099,\"lng\":121.535751}]}" | jq .
curl -s -X POST "${API_BASE}/route/search" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d "{\"points\":[{\"id\":0,\"time\":\"2025-11-08T23:08:00:000000\",\"lat\":25.024099,\"lng\":121.535751}]}" | jq .
curl -s -X POST "${API_BASE}/route/find-forward-safe-place" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d "{\"points\":[{\"lat\":25.024099,\"lng\":121.535751},{\"lat\":25.024199,\"lng\":121.535851}],\"radius\":500}" | jq .
curl -s -X POST "${API_BASE}/points" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d "{\"uuid\":\"${UUID}\",\"time\":\"2025-11-08T23:08:00:000000\",\"lat\":25.024099,\"lon\":121.535751,\"type\":\"dangerous\"}" | jq .
curl -s -X GET "${API_BASE}/points/${UUID}" -H "Authorization: Bearer ${TOKEN}" | jq .
UUUID=$(curl -s -X GET "${API_BASE}/points/${UUID}" -H "Authorization: Bearer ${TOKEN}" | jq -r '.data.data[0].uuuid // empty')
if [ -n "$UUUID" ]; then
  curl -s -X DELETE "${API_BASE}/points" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d "{\"uuid\":\"${UUID}\",\"uuuid\":\"${UUUID}\"}" | jq .
fi
curl -s -X POST "${API_BASE}/danger-zones" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d "{\"lat\":25.024099,\"lng\":121.535751,\"radius\":1000}" | jq .
