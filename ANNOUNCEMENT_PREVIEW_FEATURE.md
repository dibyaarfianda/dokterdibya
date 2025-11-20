# Enhanced Announcement Preview Feature

## Overview
This feature adds enhanced preview capabilities to the clinic announcement system, allowing staff to create rich, formatted announcements with images and see exactly how they will appear to patients before publishing.

## New Features

### 1. Live Preview Modal
- **Tab-based interface**: Switch between "Edit" and "Preview" modes
- **Real-time preview**: See exactly how announcements will look to patients
- **Auto-update**: Preview automatically updates when switching to the preview tab
- **Manual refresh**: Use the "Update Preview" button to refresh the preview at any time

### 2. Image Support
- **Image URL field**: Add images to announcements via URL
- **Automatic error handling**: Images that fail to load are hidden gracefully
- **Responsive display**: Images scale properly on all device sizes
- **Preview support**: Images appear in both the staff preview and patient dashboard

### 3. Rich Text Formatting
- **Markdown support**: Use markdown syntax for rich formatting
- **Plain text option**: Choose between plain text and markdown
- **Formatting toolbar**: Quick buttons for common markdown formatting:
  - **Bold** text
  - *Italic* text
  - Links
  - Lists
- **Safe rendering**: All markdown is sanitized with DOMPurify to prevent XSS attacks

### 4. Enhanced Display
- **Formatted content**: Properly rendered HTML from markdown
- **Better typography**: Improved line spacing and readability
- **Consistent styling**: Matches the clinic's brand colors and design

## Database Changes

### New Columns in `announcements` table:
- `image_url` (VARCHAR 500): URL of the announcement image
- `formatted_content` (MEDIUMTEXT): Pre-rendered HTML content for markdown
- `content_type` (ENUM): Type of content - 'plain', 'markdown', or 'html'

### Migration
Run the migration file: `staff/backend/migrations/20251120_add_announcement_features.sql`

```sql
mysql -u root -p dibyaklinik < staff/backend/migrations/20251120_add_announcement_features.sql
```

## API Updates

### Updated Endpoints

#### GET /api/announcements/active
Now returns additional fields:
- `image_url`
- `formatted_content`
- `content_type`

#### POST /api/announcements
Accepts new fields:
- `image_url` (optional)
- `formatted_content` (optional, auto-generated for markdown)
- `content_type` (default: 'plain')

#### PUT /api/announcements/:id
Same new fields as POST endpoint

## Usage Guide

### Creating an Announcement with Image and Formatting

1. Navigate to "Kelola Pengumuman" in the staff portal
2. Click "Buat Pengumuman Baru"
3. Fill in the announcement details:
   - **Title**: Enter the announcement title
   - **Image URL** (optional): Paste the URL of an image
   - **Content Type**: Select "Markdown" for rich formatting or "Plain Text"
   - **Message**: Enter your message (use markdown syntax if selected)
4. Click the "Preview" tab to see how it will look
5. Click "Update Preview" to refresh the preview after making changes
6. When satisfied, click "Save"

### Markdown Formatting Examples

```markdown
**Bold text**
*Italic text*
[Link text](https://example.com)
- List item 1
- List item 2
```

### Using the Formatting Toolbar

When "Markdown" is selected:
- Click **B** to make text bold
- Click *I* to make text italic
- Click the link icon to insert a link
- Click the list icon to insert a bullet point

## Technical Details

### Frontend Libraries
- **marked.js**: Markdown parser
- **DOMPurify**: HTML sanitization to prevent XSS

### Files Modified
1. **Backend**:
   - `staff/backend/routes/announcements.js` - Updated API endpoints
   - `staff/backend/migrations/20251120_add_announcement_features.sql` - Database migration

2. **Staff Portal**:
   - `staff/public/kelola-announcement.html` - Enhanced UI with preview tabs
   - `staff/public/scripts/kelola-announcement.js` - Preview functionality

3. **Patient Dashboard**:
   - `public/patient-dashboard.html` - Added markdown libraries
   - `public/js/announcements-dashboard.js` - Enhanced rendering

## Security Considerations

- All user-generated HTML is sanitized using DOMPurify
- Image URLs are validated and escaped
- XSS protection is maintained throughout the rendering pipeline
- Content type is validated on the backend

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile responsive design
- Graceful degradation for older browsers (falls back to plain text)

## Future Enhancements

Potential future improvements:
- Direct image upload (vs URL only)
- WYSIWYG editor option
- Template library for common announcements
- Scheduled announcements
- A/B testing for different versions
