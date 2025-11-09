#!/bin/bash


API_BASE="http://localhost:3000/api"
UUID="7f3562f4-bb3f-4ec7-89b9-da3b4b5ff250"
ID_NO="A123456789"

TOKEN=$(curl -s -X POST "${API_BASE}/auth/login" -H "Content-Type: application/json" -d "{\"uuid\":\"${UUID}\",\"idNo\":\"${ID_NO}\"}" | jq -r '.data.token')
#curl -s -X POST "${API_BASE}/route/plan" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d "{\"points\":[{\"id\":0,\"time\":\"2025-11-08T23:08:00:000000\",\"lat\":25.024099,\"lng\":121.535751}]}" | jq .
#curl -s -X POST "${API_BASE}/route/search" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d "{\"points\":[{\"id\":0,\"time\":\"2025-11-08T23:08:00:000000\",\"lat\":25.024099,\"lng\":121.535751}]}" | jq .
curl -s -X POST "${API_BASE}/route/find-forward-safe-place" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d "{\"points\":[{\"lat\":25.024099,\"lng\":121.535751},{\"lat\":25.024199,\"lng\":121.535851}],\"radius\":500}" | jq .