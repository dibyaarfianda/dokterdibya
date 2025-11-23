#!/bin/bash
# Install global chat to all staff HTML pages

SCRIPT_LINE='    <!-- Global Chat Loader -->\n    <script src="/staff/public/scripts/global-chat-loader.js"></script>'

# List of important pages (exclude login, test pages, utility pages)
PAGES=(
    "staff/public/index-adminlte.html"
    "staff/public/kelola-pasien.html"
    "staff/public/kelola-tindakan.html"
    "staff/public/kelola-obat.html"
    "staff/public/kelola-appointment.html"
    "staff/public/kelola-jadwal.html"
    "staff/public/kelola-announcement.html"
    "staff/public/patient-intake-review.html"
    "staff/public/medical-record.html"
    "staff/public/finance-analysis.html"
    "staff/public/management.html"
    "staff/public/profile-settings.html"
    "staff/public/appointment-archive.html"
)

for page in "${PAGES[@]}"; do
    file="/var/www/dokterdibya/$page"
    
    if [ -f "$file" ]; then
        # Check if already added
        if grep -q "global-chat-loader.js" "$file"; then
            echo "✓ $page - Already has global chat"
        else
            # Add before </body>
            sed -i "s|</body>|$SCRIPT_LINE\n</body>|" "$file"
            echo "✓ $page - Global chat added"
        fi
    else
        echo "✗ $page - File not found"
    fi
done

echo ""
echo "Global chat installation complete!"
echo "Restart browser to see chat on all pages."
