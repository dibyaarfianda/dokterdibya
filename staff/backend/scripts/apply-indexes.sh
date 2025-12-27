#!/bin/bash
# Apply database indexes
# Usage: ./apply-indexes.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env file
if [ -f "$SCRIPT_DIR/../.env" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/../.env" | grep -E 'DB_|MYSQL_' | xargs)
fi

# Get database credentials
DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-dibyaklinik_user}"
DB_NAME="${DB_NAME:-dibyaklinik}"

echo "========================================="
echo "Database Index Optimization"
echo "========================================="
echo "Host: $DB_HOST"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo ""
read -p "Apply indexes to database? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Operation cancelled."
    exit 0
fi

echo ""
echo "Applying indexes..."
mysql -h "$DB_HOST" -u "$DB_USER" -p "$DB_NAME" < "$SCRIPT_DIR/add-indexes.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "✓ Indexes applied successfully!"
    echo ""
    echo "Query performance should now be improved for:"
    echo "  - Patient searches"
    echo "  - Visit queries"
    echo "  - Medication lookups"
    echo "  - Appointment schedules"
else
    echo ""
    echo "✗ Failed to apply indexes"
    echo "Please run the SQL manually:"
    echo "  mysql -u $DB_USER -p $DB_NAME < scripts/add-indexes.sql"
    exit 1
fi
