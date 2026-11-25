#!/usr/bin/env bash
# Importa y publica los workflows de n8n/ en el contenedor n8n de docker compose.
# Uso: npm run n8n:import   (con `docker compose up -d` ya en marcha)
set -euo pipefail
cd "$(dirname "$0")/.."

# El error handler va primero: los otros dos lo referencian en settings.errorWorkflow.
WORKFLOWS=(error-handler loan-event-notification overdue-reminders)
IDS=(lendloopErrors01 lendloopLoanEvt1 lendloopOverdue1)

for i in "${!WORKFLOWS[@]}"; do
  file="n8n/${WORKFLOWS[$i]}.json"
  docker compose cp "$file" "n8n:/tmp/${WORKFLOWS[$i]}.json" >/dev/null
  docker compose exec -T n8n n8n import:workflow --input="/tmp/${WORKFLOWS[$i]}.json"
  docker compose exec -T n8n n8n publish:workflow --id="${IDS[$i]}"
done

echo "Done. Workflows are published; n8n picks them up within a few seconds."
