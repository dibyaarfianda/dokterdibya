# HTML Structure Breakdown - womenob.net

## Page Layout Architecture

```
+------------------+------------------------------------------+
|                  |                                          |
|   SIDE PANEL     |          MAIN CONTENT AREA               |
|   (320px fixed)  |     (horizontal scroll buckets)          |
|                  |                                          |
|   - Logo [IMG 1] |  [BUCKET 1] [BUCKET 2] [BUCKET 3] ...   |
|   - Practice name|  [IMG 2]    [IMG 3]    [IMG 4]          |
|   - Navigation   |                                          |
|   - Address      |                                          |
|   - Phone        |                                          |
|   - Social       |          SCROLL ARROWS (bottom-right)    |
|                  |                                          |
+------------------+------------------------------------------+
|                  FOOTER (fixed bottom, 90px)                |
|   [Contact Us]  Home | Sitemap | Disclaimer    [Copyright]  |
+-------------------------------------------------------------+
```

## HTML Structure (Simplified)

```html
<body id="home" class="home preset-dark-grey">

  <!-- 1. MOBILE MENU (visible < 768px) -->
  <div id="mobile-menu" class="nav-mobile-wrap">
    <a class="menu-control">hamburger</a>
    <a class="phone-link">phone icon</a>
    <a class="contact-link">map icon</a>
  </div>

  <!-- 2. CONTACT INFO PANEL (hidden, slides in) -->
  <div id="contact-info" class="side-panel-offset-absolute fixed">
    <div id="contact-info-form">
      <!-- Gravity Form contact form -->
    </div>
  </div>

  <!-- 3. SIDE PANEL / HEADER (left, 320px) -->
  <div class="header-wrap side-panel text-light top-left">
    <header id="header" class="scroll-vert text-center text-upper">

      <!-- Logo [IMG 1] -->
      <div id="client-logo">
        <img id="organization-logo" src="logo.jpg" />
      </div>

      <!-- Practice Name -->
      <div id="practice" class="h1">WOMEN Obstetrics & Gynecology</div>

      <!-- Navigation -->
      <div id="sidr" class="nav-wrap">
        <nav class="menu">
          <ul id="nav" class="main-menu sf-menu sf-vertical">
            <li><a>Home</a></li>
            <li><a>About Our Practice</a></li>
            <li><a>Meet Us</a></li>
            <!-- ... 10 items total -->
          </ul>
        </nav>
      </div>

      <!-- Address -->
      <div id="location">300 20th Avenue North, Suite 505...</div>

      <!-- Phone -->
      <div id="phone"><a href="tel:...">615-340-4655</a></div>

      <!-- Social Links -->
      <p class="social-links">
        <a class="fa fa-instagram" href="instagram-url"></a>
      </p>

    </header>
  </div>

  <!-- 4. MAIN CONTENT AREA -->
  <div class="side-panel-offset footer-offset fill-height">
    <div class="fill-height relative no-overflow-home">

      <!-- Scroll Arrows (bottom-right) -->
      <div id="scroll-box-horz-right" class="scroll-box-direction">arrow right</div>
      <div id="scroll-box-horz-left" class="scroll-box-direction">arrow left</div>

      <!-- Horizontal Scroll Container -->
      <div id="scroll-box-horz" class="fill-height">
        <div id="featured" class="bucket-wrap fill-height">
          <div class="container fill-height">
            <div class="row fill-height">

              <!-- BUCKET 1 [IMG 2] -->
              <div id="bucket1" class="bucket bg-accent-hover bucket-odd"
                   style="background-image: url(featuredImage1.jpg)">
                <h2 class="bucket-title bg-dark">About Our Practice</h2>
                <div class="bucket-content">
                  <div class="bucket-text">description text</div>
                  <a class="bucket-link btn">Learn More</a>
                  <a class="bucket-link btn contact-link">Contact Us</a>
                </div>
              </div>

              <!-- BUCKET 2 [IMG 3] -->
              <div id="bucket2" class="bucket bg-accent-hover bucket-even"
                   style="background-image: url(...)">
                <!-- same structure -->
              </div>

              <!-- BUCKET 3 [IMG 4] - bucket-odd -->
              <!-- BUCKET 4 [IMG 5] - bucket-even -->
              <!-- BUCKET 5 [IMG 6] - bucket-odd -->
              <!-- BUCKET 6 [IMG 7] - bucket-even -->

            </div>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- 5. FOOTER (fixed bottom) -->
  <div class="footer-wrap bg-dark fixed">
    <footer class="container">
      <a id="show-contact-info" class="btn">Contact Us</a>
      <nav class="menu-legal">
        <ul class="list-inline">
          <li>info icon</li>
          <li><a>Home</a></li>
          <li><a>Sitemap</a></li>
          <li><a>Disclaimer</a></li>
        </ul>
      </nav>
      <p class="pbhs-copyright">Medical Website Design by PBHS</p>
      <div class="show-on-active">
        <!-- Expanded footer info: addresses, cities served -->
      </div>
    </footer>
  </div>

  <!-- 6. CONTENT TRANSITION BAR -->
  <div id="content-transition"></div>

  <!-- 7. SCROLL TO TOP -->
  <a class="scrollup hidden-xs" id="scrollup">arrow up</a>

  <!-- 8. ACCESSIBILITY WHEEL -->
  <div class="wheel-button-wrap">
    <a id="accessibility-tools">accessibility icon</a>
    <ul id="accessibility-wheel" class="wheel">
      <li>White on Black</li>
      <li>Black on White</li>
      <li>Increase Font</li>
      <li>Decrease Font</li>
      <li>Reset</li>
    </ul>
  </div>

</body>
```

## Interior Page Structure (Meet Us, About, etc.)

```
+------------------+------------------+------------------------+
|                  |                  |                        |
|   SIDE PANEL     |   SUB-NAV PANEL  |   MAIN CONTENT         |
|   (same as home) |   (side-wrap)    |   (page-content-wrap)  |
|                  |                  |                        |
|                  |   - Section title|   - Breadcrumb         |
|                  |   - Sub-pages    |   - H1 Title           |
|                  |   - Active state |   - Body text          |
|                  |                  |   - Images             |
+------------------+------------------+------------------------+
|                        FOOTER                                |
+-------------------------------------------------------------+
```

## Key CSS Classes

| Class | Purpose |
|-------|---------|
| `.side-panel` | Left panel (320px width) |
| `.side-panel-offset` | Content shifted right by 320px |
| `.fill-height` | height: 100% |
| `.bg-dark` | Dark background (#333) |
| `.bg-accent-hover` | Hover overlay effect |
| `.bucket` | Homepage feature card (400px wide) |
| `.bucket-odd` / `.bucket-even` | Overlay animation direction |
| `.bucket-content` | Fade-in content on hover |
| `.scroll-vert` | Vertical scrollable area |
| `.text-upper` | text-transform: uppercase |
| `.text-light` | Muted text color |
| `.cascade-text-color` | Inherited text color |
| `.layer[N]` | z-index layering (layer2 through layer10) |
| `.padding-vert-more` | Extra vertical padding |
| `.padding-horz-half` | Half horizontal padding |

## Responsive Breakpoints

| Breakpoint | Changes |
|-----------|---------|
| >= 1200px (lg) | Full layout: side panel + horizontal scroll |
| 992-1199px (md) | Buckets overflow-y scroll, content area overlaps |
| 768-991px (sm) | Buckets stack vertically, always show overlay |
| < 768px (xs) | No side panel, mobile menu, stacked buckets, no fixed footer |
