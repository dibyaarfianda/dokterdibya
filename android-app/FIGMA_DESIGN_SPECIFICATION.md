# Dokter Dibya Mobile App - Figma Design Specification

## Design System Overview

This document provides complete specifications for creating Figma designs for the Dokter Dibya Android mobile application.

---

## Color Palette

### Primary Colors
```
Primary (Blue)
- Primary 900: #1a5490
- Primary 700: #2174b9
- Primary 500: #28a7e9  ← Main brand color
- Primary 300: #6dc3f0
- Primary 100: #b8e0f7

Secondary (Teal/Green)
- Secondary 700: #00897b
- Secondary 500: #00acc1
- Secondary 300: #4dd0e1

Accent (Orange - for important actions)
- Accent 700: #e67e22
- Accent 500: #f39c12
- Accent 300: #f8b84e
```

### Semantic Colors
```
Success: #27ae60 (Green)
Warning: #f39c12 (Orange)
Error: #e74c3c (Red)
Info: #3498db (Blue)
```

### Priority Colors (Announcements/Alerts)
```
Urgent: #e74c3c (Red)
Important: #f39c12 (Orange)
Normal: #28a7e9 (Blue)
```

### Neutral Colors
```
Gray 900 (Text Primary): #1a1a1a
Gray 700 (Text Secondary): #4a4a4a
Gray 500 (Text Disabled): #9e9e9e
Gray 300 (Borders): #e0e0e0
Gray 100 (Background): #f5f5f5
White: #ffffff

Dark Theme:
- Background: #121212
- Surface: #1e1e1e
- Surface Variant: #2a2a2a
```

### Gradients
```
Primary Gradient:
- Start: #28a7e9
- End: #2174b9
- Direction: 135deg

Success Gradient:
- Start: #27ae60
- End: #219653

Header Gradient:
- Start: rgba(40, 167, 233, 0.95)
- End: rgba(33, 116, 185, 0.95)
```

---

## Typography

### Font Family
```
Primary: Poppins (Google Fonts)
Secondary: Open Sans (for body text)
Monospace: Roboto Mono (for codes, IDs)
```

### Type Scale
```
Display Large
- Font: Poppins Bold
- Size: 32sp
- Line Height: 40sp
- Use: Splash screen, onboarding titles

Display Medium
- Font: Poppins Bold
- Size: 28sp
- Line Height: 36sp
- Use: Page headers

Headline
- Font: Poppins SemiBold
- Size: 24sp
- Line Height: 32sp
- Use: Section titles

Title Large
- Font: Poppins SemiBold
- Size: 20sp
- Line Height: 28sp
- Use: Card titles, dialog headers

Title Medium
- Font: Poppins Medium
- Size: 16sp
- Line Height: 24sp
- Use: List item titles

Body Large
- Font: Open Sans Regular
- Size: 16sp
- Line Height: 24sp
- Use: Primary body text

Body Medium
- Font: Open Sans Regular
- Size: 14sp
- Line Height: 20sp
- Use: Secondary text, descriptions

Body Small
- Font: Open Sans Regular
- Size: 12sp
- Line Height: 16sp
- Use: Captions, helper text

Label Large
- Font: Poppins Medium
- Size: 14sp
- Line Height: 20sp
- Letter Spacing: 0.1sp
- Use: Buttons

Label Medium
- Font: Poppins Medium
- Size: 12sp
- Line Height: 16sp
- Letter Spacing: 0.5sp
- Use: Chips, badges

Label Small
- Font: Poppins Medium
- Size: 10sp
- Line Height: 14sp
- Letter Spacing: 0.5sp
- Use: Small labels, timestamps
```

---

## Spacing System

```
Space 4: 4dp
Space 8: 8dp
Space 12: 12dp
Space 16: 16dp ← Base unit
Space 20: 20dp
Space 24: 24dp
Space 32: 32dp
Space 40: 40dp
Space 48: 48dp
Space 64: 64dp
```

### Component Spacing
```
Card Padding: 16dp
List Item Padding: 16dp horizontal, 12dp vertical
Button Padding: 16dp horizontal, 12dp vertical
Input Field Padding: 16dp
Screen Padding: 16dp
Section Spacing: 24dp
Bottom Navigation Height: 56dp
Top App Bar Height: 56dp
```

---

## Elevation & Shadows

```
Level 0 (None): elevation(0.dp)
Level 1 (Card): elevation(2.dp)
  - Shadow: 0px 1px 3px rgba(0,0,0,0.12)

Level 2 (Raised Button): elevation(4.dp)
  - Shadow: 0px 2px 4px rgba(0,0,0,0.14)

Level 3 (FAB): elevation(6.dp)
  - Shadow: 0px 3px 5px rgba(0,0,0,0.16)

Level 4 (Dialog): elevation(8.dp)
  - Shadow: 0px 4px 6px rgba(0,0,0,0.18)

Level 5 (Bottom Sheet): elevation(16.dp)
  - Shadow: 0px 8px 10px rgba(0,0,0,0.20)
```

---

## Border Radius

```
Radius XSmall: 4dp (Badges)
Radius Small: 8dp (Buttons, Inputs)
Radius Medium: 12dp (Cards)
Radius Large: 16dp (Bottom Sheet, Dialogs)
Radius XLarge: 24dp (Floating elements)
Radius Full: 999dp (Pills, Circle avatars)
```

---

## Icons

### Icon Set
- **Primary**: Material Icons (outlined variant)
- **Size**: 24dp (default), 20dp (small), 32dp (large)
- **Color**: Use Gray 700 for default, Primary 500 for active

### Common Icons Needed
```
Navigation:
- home (outlined)
- calendar_today
- medical_services
- person
- notifications
- menu
- arrow_back
- more_vert

Actions:
- add
- edit
- delete
- save
- cancel
- search
- filter_list
- refresh

Status:
- check_circle (success)
- error (error)
- warning (warning)
- info (info)
- pending (hourglass)

Medical:
- local_hospital
- medication
- vaccines
- biotech
- science
- monitor_heart
- pregnant_woman

Communication:
- email
- phone
- chat
- whatsapp
- notifications_active
```

---

## Component Specifications

### 1. Buttons

#### Primary Button
```
Type: Filled
Background: Primary 500 (#28a7e9)
Text: White, Label Large
Padding: 16dp horizontal, 12dp vertical
Border Radius: 8dp
Min Height: 48dp
Shadow: Level 2
Ripple: White with 20% opacity

States:
- Pressed: Primary 700
- Disabled: Gray 300, Text Gray 500
```

#### Secondary Button
```
Type: Outlined
Border: 1dp solid Primary 500
Text: Primary 500, Label Large
Padding: 16dp horizontal, 12dp vertical
Border Radius: 8dp
Min Height: 48dp
Background: Transparent
Ripple: Primary 500 with 10% opacity

States:
- Pressed: Primary 100 background
- Disabled: Gray 300 border, Gray 500 text
```

#### Text Button
```
Type: Text
Text: Primary 500, Label Large
Padding: 8dp horizontal, 6dp vertical
Border Radius: 4dp
Ripple: Primary 500 with 10% opacity
```

#### Icon Button
```
Size: 40dp x 40dp
Icon Size: 24dp
Icon Color: Gray 700
Border Radius: Full (circle)
Ripple: Gray with 10% opacity
```

#### Floating Action Button (FAB)
```
Size: 56dp x 56dp
Icon Size: 24dp
Background: Accent 500 (#f39c12)
Icon Color: White
Border Radius: Full
Shadow: Level 3

Mini FAB:
- Size: 40dp x 40dp
- Icon Size: 20dp
```

### 2. Input Fields

#### Text Input (Outlined)
```
Height: 56dp
Border: 1dp solid Gray 300
Border Radius: 8dp
Padding: 16dp
Text: Body Large, Gray 900
Placeholder: Body Large, Gray 500
Label: Body Small, Gray 700 (floating)

States:
- Focused: Border Primary 500 (2dp)
- Error: Border Error, Helper text Error
- Disabled: Background Gray 100, Text Gray 500

With Icon:
- Leading Icon: 24dp, 12dp from left
- Trailing Icon: 24dp, 12dp from right
```

#### Text Area
```
Min Height: 120dp
Max Height: 200dp (scrollable)
Border: 1dp solid Gray 300
Border Radius: 8dp
Padding: 16dp
Text: Body Large
```

#### Dropdown/Select
```
Same as Text Input
Trailing Icon: arrow_drop_down (24dp)
Dropdown Menu: Card with List Items
```

### 3. Cards

#### Standard Card
```
Background: White
Border Radius: 12dp
Shadow: Level 1
Padding: 16dp
Margin: 8dp bottom

Dark Mode:
- Background: Surface (#1e1e1e)
```

#### Announcement Card
```
Background: White
Border Radius: 12dp
Border Left: 4dp solid (Priority Color)
Shadow: Level 1
Padding: 16dp

Priority Indicator:
- Urgent: Red left border
- Important: Orange left border
- Normal: Blue left border

Components:
- Title: Title Medium, Gray 900
- Badge: Label Small, White on Priority Color, Border Radius Full
- Content: Body Medium, Gray 700
- Image: Max height 200dp, Border Radius 8dp
- Footer: Body Small, Gray 500
```

#### Appointment Card
```
Background: White
Border Radius: 12dp
Shadow: Level 1
Padding: 16dp

Components:
- Date Badge: Label Medium, Primary 500, Background Primary 100
- Title: Title Medium
- Time: Body Medium with clock icon
- Status Badge: Label Small, colored by status
```

#### Patient Card (Staff)
```
Layout: Horizontal
Height: 72dp
Padding: 12dp 16dp

Components:
- Avatar: 48dp circle, left aligned
- Name: Title Medium
- MR ID: Body Small, Gray 500
- Chevron: 24dp, right aligned
```

### 4. Lists

#### List Item (Single Line)
```
Height: 56dp
Padding: 16dp horizontal
Layout: Horizontal

Components:
- Leading Icon/Avatar: 24dp/40dp
- Title: Body Large, Gray 900
- Trailing: Icon or text
```

#### List Item (Two Line)
```
Height: 72dp
Padding: 12dp 16dp

Components:
- Leading: Icon/Avatar
- Title: Body Large, Gray 900
- Subtitle: Body Medium, Gray 700
- Trailing: Icon or text
```

#### List Item (Three Line)
```
Height: 88dp
Padding: 12dp 16dp

Components:
- Leading: Icon/Avatar
- Title: Body Large
- Subtitle: Body Medium (line 1)
- Supporting Text: Body Small, Gray 500 (line 2)
- Trailing: Icon or text
```

#### Divider
```
Height: 1dp
Color: Gray 300
Margin: 0dp 16dp (for inset)
```

### 5. Chips

#### Filter Chip
```
Height: 32dp
Padding: 12dp horizontal
Border Radius: Full
Border: 1dp solid Gray 300
Text: Label Medium, Gray 700

Selected State:
- Background: Primary 100
- Border: Primary 500
- Text: Primary 700
- Checkmark: 18dp, left
```

#### Action Chip
```
Height: 32dp
Padding: 12dp horizontal
Border Radius: Full
Background: Gray 100
Text: Label Medium, Gray 900
Icon: 18dp (optional, left)
```

#### Status Chip/Badge
```
Height: 24dp
Padding: 8dp horizontal
Border Radius: Full
Text: Label Small, White

Colors by Status:
- Scheduled: #3498db
- Confirmed: #27ae60
- Completed: #95a5a6
- Cancelled: #e74c3c
- No Show: #e67e22
- Unpaid: #e74c3c
- Paid: #27ae60
- Partial: #f39c12
```

### 6. Dialogs

#### Alert Dialog
```
Width: 280dp (phone), 560dp (tablet)
Border Radius: 16dp
Background: White
Shadow: Level 4
Padding: 24dp

Components:
- Icon: 24dp, centered (optional)
- Title: Title Large, centered
- Content: Body Medium, Gray 700
- Actions: Text buttons, right aligned
```

#### Bottom Sheet
```
Border Radius: 16dp 16dp 0 0
Background: White
Shadow: Level 5
Handle: 32dp x 4dp, Gray 300, centered, 12dp from top

Padding: 16dp
Max Height: 90% screen height
```

### 7. Navigation

#### Bottom Navigation Bar
```
Height: 56dp
Background: White
Shadow: 0px -2px 4px rgba(0,0,0,0.08)

Items: 3-5 items
Item Layout:
- Icon: 24dp
- Label: Label Small
- Indicator: 64dp x 32dp, Border Radius Full, Primary 100 (active)
- Icon Color: Gray 500 (inactive), Primary 500 (active)
- Label Color: Gray 700 (inactive), Primary 700 (active)
```

#### Top App Bar
```
Height: 56dp
Background: Gradient (Primary)
Title: Title Large, White
Icons: 24dp, White
Shadow: Level 1

With Back:
- Leading: Back icon (24dp)
- Title: Title Medium
- Actions: Icons (24dp), max 3
```

#### Navigation Drawer (Staff)
```
Width: 280dp
Background: White
Shadow: Level 3

Components:
- Header: 180dp height, Gradient background
  - Avatar: 64dp circle
  - Name: Title Medium, White
  - Email: Body Small, White with 80% opacity
- Divider: 1dp
- List Items: Standard list items
- Active Indicator: Primary 100 background, Primary 700 text
```

### 8. Loading & Empty States

#### Loading Indicator
```
Circular Progress:
- Size: 40dp
- Stroke Width: 4dp
- Color: Primary 500

Linear Progress:
- Height: 4dp
- Color: Primary 500
- Background: Primary 100
```

#### Empty State
```
Layout: Vertical, centered
Padding: 48dp

Components:
- Illustration: 120dp x 120dp (vector graphic)
- Title: Title Medium, Gray 900
- Description: Body Medium, Gray 700
- Action Button: Primary button (optional)
```

#### Error State
```
Similar to Empty State
Icon: error_outline, 120dp, Error color
Title: "Oops! Something went wrong"
Description: Error message
Actions: "Retry" button
```

### 9. Avatar

#### Sizes
```
XSmall: 24dp
Small: 32dp
Medium: 40dp
Large: 56dp
XLarge: 72dp
XXLarge: 120dp

Border Radius: Full (circle)
Border: 2dp solid White (for overlapping avatars)

Placeholder:
- Background: Gray 300
- Icon: person (Gray 500)
- Initials: Label Large, Gray 700
```

### 10. Calendar View

#### Month View
```
Header:
- Month/Year: Title Large
- Navigation: Icon buttons (chevron_left, chevron_right)

Grid:
- 7 columns (days of week)
- Day Cell: 40dp x 40dp
- Day Label: Label Small, Gray 700
- Date: Label Medium

States:
- Today: Primary 100 background, Primary 700 text
- Selected: Primary 500 background, White text
- Disabled: Gray 300 text
- Has Appointment: Small dot below date (Primary 500)
```

### 11. Time Slot Selector

#### Session Tabs
```
Layout: Horizontal, equal width
Height: 40dp
Border Radius: 8dp
Background: Gray 100

Tab:
- Text: Label Large
- Color: Gray 700 (inactive), White (active)
- Background: Transparent (inactive), Primary 500 (active)
```

#### Time Slot Grid
```
Grid: 2 columns
Gap: 8dp
Slot Height: 48dp

Slot Item:
- Border: 1dp solid Gray 300
- Border Radius: 8dp
- Text: Label Large, centered
- Icon: check_circle (if selected)

States:
- Available: White background, Gray 900 text
- Selected: Primary 100 background, Primary 700 text
- Booked: Gray 100 background, Gray 500 text, disabled
```

### 12. Medical Form Components

#### Section Header
```
Height: 48dp
Background: Gray 100
Padding: 16dp
Text: Title Medium, Gray 900
Border Bottom: 1dp solid Gray 300
```

#### Radio Group
```
Item Height: 48dp
Layout: Horizontal

Radio Button:
- Size: 20dp
- Border: 2dp
- Color: Gray 500 (unchecked), Primary 500 (checked)
- Inner Circle: 10dp (checked)

Label: Body Large, Gray 900, 12dp left margin
```

#### Checkbox
```
Size: 20dp
Border: 2dp, Border Radius: 4dp
Color: Gray 500 (unchecked), Primary 500 (checked)
Checkmark: White, 12dp

Label: Body Large, Gray 900, 12dp left margin
```

#### Signature Pad
```
Height: 200dp
Border: 1dp solid Gray 300
Border Radius: 8dp
Background: White

Controls:
- Clear button: Text button, top right
- Stroke Color: Gray 900
- Stroke Width: 2dp
```

---

## Screen Layouts

### Patient App Screens

#### 1. Splash Screen
```
Layout: Centered
Background: Primary Gradient

Components:
- Logo: 120dp x 120dp
- App Name: Display Medium, White
- Tagline: Body Large, White with 80% opacity
- Loading Indicator: 40dp, bottom aligned
```

#### 2. Welcome/Onboarding (3 Screens)
```
Layout: Vertical, centered
Padding: 24dp

Components:
- Illustration: 280dp x 280dp
- Title: Display Medium
- Description: Body Large, Gray 700
- Page Indicator: Dots, Primary 500
- Skip Button: Text button, top right
- Next/Get Started: Primary button, bottom
```

#### 3. Login Screen
```
Layout: Vertical
Padding: 24dp

Components:
- Logo: 80dp x 80dp, centered
- Title: Headline, "Selamat Datang"
- Subtitle: Body Medium, "Masuk ke akun Anda"
- Email Input: Outlined text field
- Password Input: Outlined text field, trailing: visibility toggle
- Forgot Password: Text button, right aligned
- Login Button: Primary button, full width
- Divider: "atau" text with lines
- Google Sign-In: Outlined button, Google icon
- Sign Up Prompt: Body Medium + Text button
```

#### 4. Registration Screen
```
Similar to Login
Additional Fields:
- Full Name
- Phone Number
- Birth Date (date picker)
- WhatsApp Number
- Password (with strength indicator)
- Confirm Password
- Terms Checkbox

Password Strength:
- Weak: Error color, 33% progress
- Medium: Warning color, 66% progress
- Strong: Success color, 100% progress
```

#### 5. Email Verification Screen
```
Layout: Vertical, centered
Padding: 24dp

Components:
- Icon: email, 80dp, Primary 500
- Title: Headline, "Verifikasi Email"
- Description: Body Medium
- Email Display: Body Large, Primary 700
- Code Input: 6 separate boxes (OTP style)
  - Size: 48dp x 56dp each
  - Border Radius: 8dp
  - Text: Display Medium, centered
- Verify Button: Primary button
- Resend: Text button with countdown
```

#### 6. Patient Dashboard
```
Layout: Vertical scroll
Background: Gray 100

Components:
1. Header Card (Gradient background):
   - Height: 180dp
   - Avatar: 80dp circle, left
   - Name: Title Large, White
   - Welcome Text: Body Medium, White 80%
   - MR ID: Label Medium, White 60%
   - Notification Icon: Top right

2. Quick Stats Row:
   - 3 stat cards, horizontal
   - Each: 100dp x 80dp
   - Icon + Number + Label

3. Upcoming Appointments:
   - Section Header: Title Medium
   - Appointment Cards (max 3)
   - "View All" button

4. Recent Announcements:
   - Section Header: Title Medium
   - Announcement Cards (max 3)
   - "View All" button

5. Quick Actions:
   - Grid: 2 columns x 2 rows
   - Each: Icon + Label
   - Actions: Book Appointment, Intake Form, Medical Records, Help

Bottom Navigation: Home, Appointments, Records, Profile
```

#### 7. Appointment Booking Screen
```
App Bar: "Book Appointment"

Steps:
1. Select Date (Calendar view)
2. Select Session (Tabs: Morning/Afternoon/Evening)
3. Select Time (Grid of slots)
4. Add Notes (Text area, optional)
5. Confirm (Summary card)

Bottom Sheet: Booking Summary
- Date, Time, Session
- Notes
- WhatsApp Reminder toggle
- Cancel + Confirm buttons
```

#### 8. Appointments List Screen
```
App Bar: "My Appointments"
Actions: Filter icon

Filters (Bottom Sheet):
- Status chips: All, Upcoming, Past, Cancelled
- Date Range picker

List:
- Grouped by status
- Appointment cards
- Swipe to cancel (upcoming only)
- Pull to refresh

Empty State: "No appointments yet"
```

#### 9. Patient Intake Form Screen
```
App Bar: "Patient Intake Form"
Progress: Linear progress bar

Sections (Stepper):
1. Personal Information
2. Medical History
3. Current Symptoms
4. Digital Signature
5. Documents (optional)

Bottom: Previous + Next buttons
Final: Submit button

Save Draft: Auto-save + manual save icon
```

#### 10. Medical Records Screen
```
Tabs: Visits, Exams, Prescriptions, Billing

Visit History:
- Timeline view
- Visit cards with date, doctor, services
- Expandable for details

Medical Exams:
- Filter chips: All, Anamnesa, Physical, USG, Lab
- Exam cards
- Tap to view details

Prescriptions:
- List of medications
- Date, dosage, instructions

Billing:
- Invoice list
- Status badges
- Download PDF icon
```

#### 11. Announcements Screen
```
App Bar: "Announcements"

List:
- Full-width announcement cards
- Priority color-coded
- Images displayed
- Markdown rendered
- Expand/collapse for long content

Real-time: New announcement badge
```

#### 12. Profile Screen
```
Header:
- Large avatar (120dp), centered
- Upload photo button
- Name: Title Large
- Email: Body Medium

Sections:
1. Personal Information
   - List items: Name, Email, Phone, Birth Date
   - Edit icon

2. Account Settings
   - Change Password
   - Email Verification Status
   - Linked Accounts (Google)
   - Biometric Login toggle

3. Preferences
   - Notifications toggle
   - Language selection
   - Theme selection (Light/Dark/Auto)

4. App Info
   - Version
   - Privacy Policy
   - Terms of Service
   - Help & Support

5. Logout
   - Logout button (Error color)
```

---

### Staff App Screens

#### 1. Staff Login
```
Similar to Patient Login
Differences:
- No Google Sign-In
- Role badge display after login
- Additional security (2FA optional)
```

#### 2. Staff Dashboard
```
App Bar: Logo + Notifications + Profile
Drawer: Navigation menu

Dashboard Content:
1. Welcome Card:
   - Greeting with time of day
   - Role badge
   - Today's date

2. Stats Grid (2x2):
   - Today's Appointments
   - Pending Reviews
   - Unpaid Bills
   - Active Patients

3. Today's Schedule:
   - Timeline of appointments
   - Patient name, time, status

4. Quick Actions (role-based):
   - FAB: Main action (e.g., "New Exam" for doctors)
   - Action grid: Secondary actions

5. Recent Activity:
   - Activity cards
   - User, action, timestamp

6. Online Staff:
   - Horizontal avatar list
   - Online indicator (green dot)

Bottom Navigation: Dashboard, Patients, More
FAB: Role-specific main action
```

#### 3. Navigation Drawer
```
Header:
- Avatar, Name, Role
- Email

Sections:
General:
- Dashboard
- Patients
- Appointments
- Announcements

Clinical (Doctors/Nurses):
- Medical Exams
- Sunday Clinic
- Intake Review

Administrative:
- Billing
- Medications
- Procedures
- Reports

System (Admin):
- Users & Roles
- Settings
- Logs

Communication:
- Team Chat (unread badge)
- Notifications

Bottom:
- Help & Support
- Logout
```

#### 4. Patient List Screen
```
App Bar: "Patients"
Actions: Search, Filter, Add

Search Bar:
- Outlined
- Placeholder: "Search by name, phone, MR ID"
- Leading: search icon
- Trailing: clear icon

Filters (Chips):
- All, Active, Inactive
- Sort: Recent, Name A-Z, Name Z-A

List:
- Patient cards (two-line)
- Avatar, Name, MR ID, Status badge
- Swipe actions: Edit, Delete
- Pagination: Load more

FAB: Add Patient
```

#### 5. Patient Details Screen
```
App Bar: Patient Name
Actions: Edit, Delete, More

Header Card:
- Large avatar
- Name: Title Large
- MR ID: Label Large, Primary 700
- Status badge
- Contact buttons: Call, WhatsApp

Tabs:
- Personal Info
- Visits
- Appointments
- Exams
- Billing
- Intake

Personal Info Tab:
- Sectioned list
- Demographics, Contact, Medical Info

Visits Tab:
- Timeline of visits
- Visit cards
- Tap to view details

(Other tabs similar to patient app)
```

#### 6. Appointment Management Screen
```
View Toggle: Calendar / List

Calendar View:
- Month view with date cells
- Appointment count badges
- Tap date to see appointments

List View:
- Filters: Date, Status, Patient
- Grouped by status
- Appointment cards

Appointment Card (Staff):
- Patient name, photo
- Date, time, type
- Status chips
- Action buttons: Confirm, Complete, Cancel
- Tap for details

FAB: New Appointment
```

#### 7. Medical Exam Screen
```
App Bar: Exam Type
Actions: Save, Templates

Patient Banner:
- Photo, Name, MR ID
- Previous exams link

Exam Type Tabs:
- Anamnesa, Physical, USG, Lab

Form Fields (varies by type):
- Text inputs
- Text areas
- Checkboxes
- Radio groups
- Image upload (USG)
- File upload (Lab)

Voice-to-Text: Mic icon on text areas

Bottom Actions:
- Save Draft
- Submit Exam

Auto-save indicator
```

#### 8. Sunday Clinic Record Screen
```
App Bar: MR ID
Actions: Finalize, Print

Progress Stepper:
1. Identitas (Identity)
2. Anamnesa
3. Fisik (Physical)
4. USG
5. Lab
6. Resep (Prescription)
7. Billing

Section Forms:
- Similar to Medical Exam
- Real-time collaboration indicator
- Lock when another user editing

Real-time Banner:
- "[User] is editing [Section]"
- Avatar + Name

Bottom Actions:
- Previous, Next
- Save Section

Final Step:
- Summary review
- Finalize button (converts to PDF)
```

#### 9. Intake Review Screen
```
App Bar: "Patient Intake Review"
Actions: Filter

Filters:
- Status: All, Pending, High-Risk, Verified, Rejected
- Date Range
- Category

List:
- Intake cards
- High-risk indicator (red flag icon)
- Quick ID, Patient name, Date
- Category badge
- Status badge

Tap to Review:
- Full submission details
- High-risk factors highlighted
- Review notes text area
- Actions: Approve, Reject, Archive
- Approve → Integrate to patient record
```

#### 10. Medications Management Screen
```
App Bar: "Medications"
Actions: Search, Add

Search + Filters:
- Search by name
- Filter by category, status
- Sort by name, stock

List/Grid Toggle:
- List: Medicine cards (stock, price, category)
- Grid: Compact view

Medicine Card:
- Name: Title Medium
- Category: Label Small
- Stock: Body Large with icon
- Low stock warning: Orange badge
- Price: Body Medium
- Status: Active/Inactive chip
- Actions: Edit, Delete

FAB: Add Medication

Bottom Sheet: Edit Medication
- Name, Category, Stock, Unit, Price, Notes
- Status toggle
- Save button
```

#### 11. Billing & Cashier Screen
```
App Bar: "Billing"
Tabs: Invoices, Create New, Reports

Invoices Tab:
- Filters: All, Unpaid, Partial, Paid
- Search by patient/invoice number
- Invoice cards
- Payment status badges
- Total amount display
- Tap for details/payment

Create New Tab:
1. Select Patient (search)
2. Link Visit/Submission
3. Add Items:
   - Services (searchable)
   - Medications (searchable)
   - Custom items
   - Item list with quantity, price
4. Apply Discount (% or amount)
5. Calculate Tax
6. Total calculation
7. Generate Invoice

Invoice Details:
- Invoice number, date
- Patient info
- Itemized list
- Subtotal, Discount, Tax, Total
- Payment status
- Payment history
- Actions: Process Payment, Print, Email

Process Payment Dialog:
- Payment method selection
- Amount paid input
- Change calculation
- Complete button
```

#### 12. Team Chat Screen
```
App Bar: "Team Chat"
Actions: Search messages

Chat List (if multiple rooms):
- Room cards
- Last message preview
- Unread count badge
- Timestamp

Chat Room:
- Messages list (scrollable)
- Message bubbles
  - Sent: Primary 500 background, right aligned
  - Received: Gray 200 background, left aligned
  - Avatar: 32dp (received messages)
  - Name: Label Small (received)
  - Message: Body Medium
  - Timestamp: Label Small, Gray 500
  - Status: Sent, Delivered, Read

Typing Indicator:
- "[User] is typing..."
- Animated dots

Input Area:
- Text input (outlined)
- Emoji button
- Attach button
- Send button (icon, Primary 500)

Real-time: Socket.IO
```

#### 13. Analytics Screen
```
App Bar: "Analytics & Reports"
Actions: Export, Date Range

Date Range Selector:
- Chips: Today, This Week, This Month, Custom
- Date picker for custom

Charts Section:
1. Revenue Trend:
   - Line chart
   - Card background
   - Axis labels
   - Tooltip on tap

2. Appointment Status:
   - Donut chart
   - Legend with colors
   - Percentage display

3. Patient Growth:
   - Bar chart
   - Monthly/Weekly toggle

4. Top Procedures:
   - Horizontal bar chart
   - Procedure names, counts

Summary Cards:
- Total Revenue
- Total Patients
- Total Appointments
- Average per Visit

Export Button:
- Bottom sheet: PDF or Excel
- Email or Download
```

---

## Responsive Design

### Phone (Width < 600dp)
```
- Single pane layout
- Bottom navigation
- Full-screen modals
- Stack components vertically
- Hamburger menu for drawer
```

### Tablet (600dp ≤ Width < 840dp)
```
- Two pane layout (list + detail)
- Navigation rail (side)
- Bottom sheets become dialogs
- Multi-column grids (2-3 columns)
- Persistent drawer
```

### Foldable/Large Tablet (Width ≥ 840dp)
```
- Three pane layout
- Permanent drawer
- Dialogs centered with max width
- Multi-column grids (3-4 columns)
- Split screens
```

---

## Accessibility

### Touch Targets
```
Minimum: 48dp x 48dp
Recommended: 48dp x 48dp
Spacing: 8dp between targets
```

### Contrast Ratios
```
Text:
- Normal text: 4.5:1 minimum
- Large text: 3:1 minimum

Interactive elements:
- 3:1 minimum

Follow WCAG 2.1 Level AA
```

### Content Descriptions
```
All images, icons, buttons need contentDescription
Decorative elements: contentDescription = ""
```

### Scalable Text
```
Support system font scaling
Test at 100%, 150%, 200% scale
Use sp for text sizes (not dp)
```

---

## Animations & Transitions

### Duration
```
Fast: 100ms (small elements)
Normal: 300ms (most transitions)
Slow: 500ms (complex animations)
```

### Easing
```
Standard: Cubic Bezier (0.4, 0.0, 0.2, 1)
Decelerate: Cubic Bezier (0.0, 0.0, 0.2, 1)
Accelerate: Cubic Bezier (0.4, 0.0, 1, 1)
```

### Common Animations
```
Screen Transitions:
- Slide from right (new screen)
- Slide to right (back)
- Fade in/out (modal)

List Items:
- Fade in + slide up (appear)
- Slide left/right (swipe actions)

Buttons:
- Ripple effect
- Scale down on press (0.95)

FAB:
- Rotate + scale (actions expand)

Loading:
- Circular progress (rotate 360°)
- Shimmer effect (cards loading)
```

---

## Figma Organization

### Page Structure
```
📄 Cover (Project info, design system preview)

📄 Design System
  ├─ 🎨 Colors
  ├─ 📝 Typography
  ├─ 🔲 Components
  │   ├─ Buttons
  │   ├─ Inputs
  │   ├─ Cards
  │   ├─ Lists
  │   ├─ Chips
  │   ├─ Dialogs
  │   ├─ Navigation
  │   └─ Icons
  ├─ 📐 Spacing & Layout
  └─ 🌓 Light/Dark Themes

📄 Patient App Flows
  ├─ 🔐 Authentication
  │   ├─ Splash
  │   ├─ Onboarding
  │   ├─ Login
  │   ├─ Register
  │   └─ Verification
  ├─ 🏠 Dashboard
  ├─ 📅 Appointments
  ├─ 📋 Intake Form
  ├─ 📄 Medical Records
  ├─ 📢 Announcements
  └─ 👤 Profile

📄 Staff App Flows
  ├─ 🔐 Authentication
  ├─ 🏠 Dashboard
  ├─ 👥 Patient Management
  ├─ 📅 Appointments
  ├─ 🩺 Medical Exams
  ├─ 🏥 Sunday Clinic
  ├─ 📋 Intake Review
  ├─ 💊 Medications
  ├─ 💰 Billing
  ├─ 💬 Team Chat
  └─ 📊 Analytics

📄 Prototypes
  ├─ Patient App Flow
  └─ Staff App Flow
```

### Component Variants
```
Use Figma variants for:
- Button states (default, hover, pressed, disabled)
- Input states (default, focused, error, disabled)
- Card types (announcement, appointment, patient)
- Chip types (filter, action, status)
- Theme (light, dark)
```

### Auto Layout
```
Use Auto Layout for:
- Spacing consistency
- Responsive designs
- Easy content changes
- Proper padding/margins
```

### Styles
```
Create styles for:
- All colors (from design system)
- All text styles (from typography scale)
- Shadow effects (elevation levels)
- Border radius (all sizes)
```

---

## Design Deliverables

### For Developers
1. **Design System Specs** (this document)
2. **Figma File** with:
   - Component library
   - All screens (light + dark)
   - Prototypes with interactions
3. **Assets**:
   - Logo (SVG, PNG @1x, @2x, @3x, @4x)
   - Icons (SVG or PNG @1x, @2x, @3x, @4x)
   - Illustrations (SVG or PNG @1x, @2x, @3x, @4x)
   - Splash screen backgrounds
4. **Specs**:
   - Spacing measurements
   - Color codes (HEX)
   - Font details
   - Animation specs

### Handoff Tools
- **Figma Inspect**: For measurements, colors, styles
- **Figma Dev Mode**: For code snippets
- **Zeplin or Avocode**: (alternative) For detailed specs

---

## Implementation Notes

### Jetpack Compose Mapping

```kotlin
// Design System → Compose
Colors → MaterialTheme.colorScheme
Typography → MaterialTheme.typography
Spacing → Dimension resources or Constants
Buttons → Button, OutlinedButton, TextButton
Cards → Card with Modifier
Lists → LazyColumn with items
```

### Theme Implementation
```kotlin
// Define colors
val Primary500 = Color(0xFF28A7E9)
val Primary700 = Color(0xFF2174B9)
// ... etc

// Light theme
val LightColorScheme = lightColorScheme(
    primary = Primary500,
    onPrimary = Color.White,
    // ... etc
)

// Dark theme
val DarkColorScheme = darkColorScheme(
    primary = Primary500,
    // ... etc
)

// Typography
val AppTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = Poppins,
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,
        lineHeight = 40.sp
    ),
    // ... etc
)
```

---

## Design Checklist

- [ ] Create design system in Figma
- [ ] Set up color styles
- [ ] Set up text styles
- [ ] Create component library
- [ ] Design authentication flows (Patient + Staff)
- [ ] Design patient app screens
- [ ] Design staff app screens
- [ ] Design empty states
- [ ] Design error states
- [ ] Design loading states
- [ ] Create light theme
- [ ] Create dark theme
- [ ] Add interactions to prototype
- [ ] Test flows with users
- [ ] Export assets
- [ ] Prepare developer handoff
- [ ] Document design decisions

---

**Document Version:** 1.0
**Last Updated:** 2025-11-20
**Design Tool:** Figma
**Target Platform:** Android (Phone & Tablet)
