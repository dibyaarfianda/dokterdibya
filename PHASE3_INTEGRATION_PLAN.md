# Phase 3: Integration & Testing Plan

## Date: 2025-11-20

## 🎯 Objective
Integrate the 16 component files created in Phase 2 into the production Sunday Clinic application, enabling the 3-template system (Obstetri, Gyn Repro, Gyn Special) to work end-to-end.

---

## 📋 Prerequisites (Already Complete)

✅ **Phase 1:** Database infrastructure with category-based MR IDs
✅ **Phase 2:** All 16 components built and tested individually
- Core Infrastructure (4 files)
- USG Components (3 category-specific)
- Anamnesa Components (3 category-specific)
- Shared Components (6 cross-template)

---

## 🔧 Phase 3 Tasks

### Part 1: HTML Integration (Priority 1)

**File:** `staff/public/sunday-clinic.html`

**Changes Needed:**

1. **Update Sidebar Navigation Labels** (Lines 312-314)
   - Change "Laboratorium" label to "Penunjang"
   - ✓ data-section attribute already correct: `data-section="penunjang"`

2. **Update Script Loading** (Line 521)
   - Current: `<script type="module" src="/staff/public/scripts/sunday-clinic.js"></script>`
   - No change needed - will update the JS file itself

3. **Add Loading Overlay**
   - Already exists: `<div class="loading-state" id="sunday-clinic-loading">` (Line 348)
   - ✓ Ready to use

---

### Part 2: Main Application Integration (Priority 1)

**File:** `staff/public/scripts/sunday-clinic.js`

**Current State:**
- Monolithic file with ~6,447 lines
- Contains all UI rendering logic

**Integration Strategy:**

**Option A: Replace Entirely (Recommended)**
- Replace `sunday-clinic.js` with new modular loader
- Import and use `main.js` from Phase 2
- Benefits: Clean start, no legacy code conflicts
- Risk: Need to ensure all existing functionality is preserved

**Option B: Gradual Migration**
- Keep existing sunday-clinic.js
- Add component system alongside
- Feature flag to switch between old/new
- Benefits: Safety, can test both systems
- Risk: Increased complexity, maintenance burden

**Recommended: Option A**

**New `sunday-clinic.js` Structure:**
```javascript
// Main application entry point
import SundayClinicApp from './sunday-clinic/main.js';
import apiClient from './sunday-clinic/utils/api-client.js';
import stateManager from './sunday-clinic/utils/state-manager.js';

// Initialize app on load
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const token = localStorage.getItem('staffToken');
    if (!token) {
        window.location.href = '/staff/public/login.html';
        return;
    }

    // Initialize API client
    apiClient.setToken(token);

    // Setup directory and navigation
    setupDirectorySystem();
    setupNavigationHandlers();
    setupDateTimeDisplay();

    // Global function for section navigation
    window.handleSectionChange = (section) => {
        stateManager.setActiveSection(section);
        scrollToSection(section);
    };

    // Wait for patient selection to load MR
    // When patient selected, call: SundayClinicApp.init(mrId)
});
```

---

### Part 3: Backend API Integration (Priority 2)

**Current API Endpoints (from existing code):**
- `GET /api/staff/sunday-clinic/directory` - Patient list
- `GET /api/staff/sunday-clinic/records/:mrId` - Get record data
- `POST /api/staff/sunday-clinic/records/:mrId/:section` - Save section data
- `GET /api/staff/sunday-clinic/billing/:mrId` - Get billing
- `POST /api/staff/sunday-clinic/billing/:mrId` - Save billing

**Component Integration Points:**

Each component's `save()` method needs to call the API:

```javascript
// Example from physical-exam.js
async save(state) {
    const data = {
        vital_signs: this.collectVitalSignsData(),
        anthropometry: this.collectAnthropometryData(),
        // ... more data
    };

    // Call API
    const response = await apiClient.saveSection(
        state.currentMrId,
        'physical_exam',
        data
    );

    return response;
}
```

**API Client Updates Needed:**

In `staff/public/scripts/sunday-clinic/utils/api-client.js`:

```javascript
async saveSection(mrId, section, data) {
    return this.post(
        `${API_ENDPOINTS.RECORDS}/${mrId}/${section}`,
        data
    );
}
```

---

### Part 4: Data Flow & State Management (Priority 2)

**Load Sequence:**

1. User selects patient from directory
2. Load MR record: `GET /api/staff/sunday-clinic/records/:mrId`
3. Response includes:
   ```json
   {
       "record": { "mr_id": "MROBS0001", "mr_category": "obstetri", ... },
       "patient": { "patient_id": "...", "full_name": "...", ... },
       "appointment": { ... },
       "intake": { "payload": {...}, "summary": {...}, "metadata": {...} },
       "anamnesa": { ... },
       "physical_exam": { ... },
       "usg": { ... },
       "penunjang": { ... },
       "diagnosis": { ... },
       "plan": { ... },
       "billing": { ... }
   }
   ```
4. Load into state manager: `stateManager.loadRecord(response.data)`
5. Main.js detects category and loads appropriate components
6. Components render with state data

**Save Sequence:**

1. User clicks "Save" button
2. Main.js calls `save()` on all loaded components
3. Each component collects form data and calls API
4. Results aggregated
5. Success: Mark state as clean, show notification
6. Error: Show error messages, keep dirty state

---

### Part 5: Component Loading Flow (Priority 2)

**File:** `staff/public/scripts/sunday-clinic/main.js`

**Current Implementation:** ✅ Already handles dynamic loading

```javascript
async loadComponents() {
    const componentPaths = this.getComponentPaths(); // Based on category
    for (const { section, path } of componentPaths) {
        const module = await import(path);
        this.components[section] = module.default;
    }
}
```

**Testing Checklist:**
- [ ] Obstetri category loads obstetri-specific components
- [ ] Gyn Repro category loads gyn-repro-specific components
- [ ] Gyn Special category loads gyn-special-specific components
- [ ] Shared components load for all categories
- [ ] Placeholder shown if component fails to load

---

### Part 6: UI/UX Integration (Priority 3)

**Navigation Updates:**

```javascript
// Sidebar navigation click handler (already in HTML)
document.addEventListener('DOMContentLoaded', function() {
    const sidebarNav = document.querySelector('.main-sidebar .nav-sidebar');
    sidebarNav.addEventListener('click', function(event) {
        const target = event.target.closest('.sc-nav-link');
        if (target && target.dataset.section) {
            event.preventDefault();
            window.handleSectionChange(target.dataset.section);
            // Update active state
            document.querySelectorAll('.sc-nav-link').forEach(link => {
                link.classList.remove('active');
            });
            target.classList.add('active');
        }
    });
});
```

**Scroll to Section:**

```javascript
function scrollToSection(section) {
    const element = document.querySelector(`[data-section="${section}"]`);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}
```

**Category Badge Display:**

Already implemented in `main.js` renderCategoryBadge():
- Obstetri: Blue badge
- Gyn Repro: Green badge
- Gyn Special: Info badge

---

### Part 7: Testing Plan (Priority 3)

**Unit Tests:**
- [ ] Each component renders without errors
- [ ] Each component collects data correctly
- [ ] Auto-calculations work (BMI, EDD, GA, EFW, CPR, billing totals)
- [ ] Dynamic lists (add/remove) work correctly

**Integration Tests:**
- [ ] Load Obstetri patient → Correct components load
- [ ] Load Gyn Repro patient → Correct components load
- [ ] Load Gyn Special patient → Correct components load
- [ ] Save all sections → Data persists correctly
- [ ] Navigate between sections → State preserved
- [ ] Form validation works
- [ ] Error handling displays correctly

**End-to-End Tests:**
- [ ] Select patient from directory
- [ ] View existing MR record
- [ ] Edit each section
- [ ] Save changes
- [ ] Reload page → Changes persisted
- [ ] Print/export functionality

---

### Part 8: Data Migration (Priority 4)

**Existing Data Format:**

Old monolithic structure needs migration to new component format.

**Migration Script Needed:**

`staff/backend/scripts/migrate-sunday-clinic-records.js`

```javascript
// Pseudo-code
for each existing record:
    1. Detect category from intake data
    2. Set mr_category field
    3. Restructure JSON data to match component format:
       - anamnesa → category-specific format
       - physical_exam → new format
       - usg → category-specific format
       - laboratorium → penunjang (rename key)
       - diagnosis → new format with array
       - plan → new format
       - billing → new format with items array
    4. Save updated record
```

**Testing Migration:**
- [ ] Backup production database
- [ ] Run migration on staging
- [ ] Verify all records accessible
- [ ] Verify data integrity
- [ ] Test with real doctors

---

### Part 9: Deployment (Priority 5)

**Deployment Checklist:**

**Phase 1 (Database):**
- [ ] Review `20251120_add_mr_category_system.sql`
- [ ] Test migration on staging database
- [ ] Backup production database
- [ ] Run migration on production
- [ ] Verify migration success
- [ ] Test existing records still accessible

**Phase 2 (Frontend Components):**
- [ ] Deploy all 16 component files to server
- [ ] Update sunday-clinic.js with new loader
- [ ] Update sunday-clinic.html sidebar label
- [ ] Clear browser caches (versioning)
- [ ] Test on staging environment
- [ ] UAT with doctors
- [ ] Deploy to production
- [ ] Monitor for errors

**Rollback Plan:**
- Keep backup of old sunday-clinic.js
- Database migration is reversible (remove columns)
- Quick rollback script ready

---

## 📊 Implementation Timeline

| Phase | Task | Estimated Time | Priority |
|-------|------|----------------|----------|
| 3.1 | Update HTML (sidebar label) | 5 min | P1 |
| 3.2 | Rewrite sunday-clinic.js loader | 2 hours | P1 |
| 3.3 | Update API client with saveSection | 30 min | P2 |
| 3.4 | Test component loading flow | 1 hour | P2 |
| 3.5 | Integration testing (all 3 templates) | 3 hours | P2 |
| 3.6 | UI/UX polish and refinement | 2 hours | P3 |
| 3.7 | Create data migration script | 3 hours | P4 |
| 3.8 | Test migration on staging | 2 hours | P4 |
| 3.9 | Deploy to production | 1 hour | P5 |
| **TOTAL** | **~15 hours** | |

---

## 🔑 Critical Success Factors

1. **Backward Compatibility:** Existing MR records must remain accessible
2. **Data Integrity:** No data loss during migration
3. **User Experience:** Seamless transition, no learning curve
4. **Performance:** Components load quickly, no lag
5. **Error Handling:** Graceful degradation if component fails

---

## 🚨 Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Component fails to load | High | Placeholder component shown, error logged |
| API endpoint mismatch | High | Comprehensive testing, API documentation |
| Data migration fails | Critical | Full database backup, rollback plan |
| Browser compatibility | Medium | Test on major browsers, polyfills |
| Performance degradation | Medium | Code splitting, lazy loading |

---

## 📝 Documentation Needed

1. **Developer Guide:** How components work, how to add new sections
2. **API Documentation:** Updated endpoint specs for components
3. **Migration Guide:** Steps to migrate old data
4. **User Guide:** New UI features (if any visible changes)
5. **Troubleshooting Guide:** Common issues and fixes

---

## ✅ Next Immediate Steps

1. ✅ Create this plan document
2. ⏳ Update sidebar label in HTML
3. ⏳ Backup old sunday-clinic.js
4. ⏳ Create new sunday-clinic.js loader
5. ⏳ Test component loading with mock data
6. ⏳ Integration with real API

---

**Phase 3 Status:** 🔵 **PLANNING COMPLETE**
**Ready to Start:** Implementation Part 1 - HTML Integration
