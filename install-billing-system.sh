#!/bin/bash

# Billing Authorization System - Quick Installation Script
# This script installs all necessary components for the billing system

set -e

echo "================================================"
echo "Billing Authorization System - Installation"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root or with sudo${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Installing PDFKit package...${NC}"
cd /var/www/dokterdibya/staff/backend
npm install pdfkit
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ PDFKit installed successfully${NC}"
else
    echo -e "${RED}✗ Failed to install PDFKit${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}Step 2: Creating invoices directory...${NC}"
mkdir -p /var/www/dokterdibya/database/invoices
chmod 755 /var/www/dokterdibya/database/invoices
chown www-data:www-data /var/www/dokterdibya/database/invoices
if [ -d "/var/www/dokterdibya/database/invoices" ]; then
    echo -e "${GREEN}✓ Invoices directory created${NC}"
else
    echo -e "${RED}✗ Failed to create invoices directory${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}Step 3: Running database migration...${NC}"
echo "Please enter MySQL root password:"
read -s MYSQL_PASSWORD

mysql -u root -p"${MYSQL_PASSWORD}" dibyaklinik <<EOF
-- Create billing revisions table
CREATE TABLE IF NOT EXISTS sunday_clinic_billing_revisions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mr_id VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    requested_by VARCHAR(255) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    approved_at DATETIME NULL,
    approved_by VARCHAR(255),
    created_at DATETIME NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_mr_id (mr_id),
    INDEX idx_status (status),
    FOREIGN KEY (mr_id) REFERENCES sunday_clinic_billings(mr_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add print tracking columns to billings table
ALTER TABLE sunday_clinic_billings
ADD COLUMN IF NOT EXISTS printed_at DATETIME NULL,
ADD COLUMN IF NOT EXISTS printed_by VARCHAR(255);

SELECT 'Migration completed successfully' as status;
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Database migration completed${NC}"
else
    echo -e "${RED}✗ Database migration failed${NC}"
    exit 1
fi
echo ""

echo -e "${YELLOW}Step 4: Restarting backend server...${NC}"
if command -v pm2 &> /dev/null; then
    pm2 restart sunday-clinic
    echo -e "${GREEN}✓ Backend restarted with PM2${NC}"
elif systemctl is-active --quiet dokterdibya-backend; then
    systemctl restart dokterdibya-backend
    echo -e "${GREEN}✓ Backend restarted with systemctl${NC}"
else
    echo -e "${YELLOW}⚠ Could not find PM2 or systemctl service. Please restart backend manually.${NC}"
fi
echo ""

echo -e "${YELLOW}Step 5: Verifying installation...${NC}"

# Check PDFKit
if npm list pdfkit --prefix /var/www/dokterdibya/staff/backend &> /dev/null; then
    echo -e "${GREEN}✓ PDFKit package installed${NC}"
else
    echo -e "${RED}✗ PDFKit not found${NC}"
fi

# Check directory
if [ -d "/var/www/dokterdibya/database/invoices" ]; then
    echo -e "${GREEN}✓ Invoices directory exists${NC}"
else
    echo -e "${RED}✗ Invoices directory not found${NC}"
fi

# Check table
TABLE_EXISTS=$(mysql -u root -p"${MYSQL_PASSWORD}" dibyaklinik -se "SHOW TABLES LIKE 'sunday_clinic_billing_revisions';" 2>/dev/null)
if [ -n "$TABLE_EXISTS" ]; then
    echo -e "${GREEN}✓ Billing revisions table created${NC}"
else
    echo -e "${RED}✗ Billing revisions table not found${NC}"
fi

# Check columns
COLUMN_EXISTS=$(mysql -u root -p"${MYSQL_PASSWORD}" dibyaklinik -se "SHOW COLUMNS FROM sunday_clinic_billings LIKE 'printed_at';" 2>/dev/null)
if [ -n "$COLUMN_EXISTS" ]; then
    echo -e "${GREEN}✓ Print tracking columns added${NC}"
else
    echo -e "${RED}✗ Print tracking columns not found${NC}"
fi

echo ""
echo "================================================"
echo -e "${GREEN}Installation Complete!${NC}"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Test billing confirmation (as dokter)"
echo "2. Test print functionality"
echo "3. Test revision request workflow"
echo "4. Monitor logs: pm2 logs dokterdibya-backend"
echo ""
echo "Documentation: /var/www/dokterdibya/BILLING_AUTHORIZATION_SYSTEM.md"
echo ""
