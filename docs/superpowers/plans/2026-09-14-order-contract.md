# Order obat implementation ledger and interface

Approved: draft per supplier; 30 day target; max(30/90 day daily demand); 7 day lead and safety defaults. User also approved including sunday_clinic_additional_billing as clinic consumption.

Worktree: D:/DAF-PROJECT/DOKTERDIBYA-order-worktree. Preserve unrelated local/VPS changes. No changes to FIFO, sales or stock writes. Execute tests, commit, push, deploy and verify.

## Tasks
- [x] Read-only production inventory audit and source/schema verification.
- [x] Recommendation engine and behavior tests (root).
- [x] Draft persistence, routes, settings, export and tests (draft agent).
- [x] Frontend tabs, editable selection, draft workflow and tests (frontend agent).
- [ ] Review, regression, live migration/deploy and browser verification (root).

## Audit 2026-09-14 WIB
55 active medications, 26 batch/stock mismatches including 10 legacy-stock medications. 12 external-sale movements have missing parent records. Movement history starts 2025-11-30; one remaining expired batch contains one unit. Four additional-billing movements total 44 units. No return movements currently. Preserve uncertainty; no data corrections. Production HEAD d1a85a05, unrelated modified main.js must be preserved.

## Shared HTTP contract
All endpoints below /api/inventory, staff-only with obat_alkes.view/create/edit permissions. JSON {success:true,data:...}; errors {success:false,message,code?,data?}. No patient identifiers.

GET /order-recommendations -> data {as_of,generated_at,parameters:{target_days:30,periods:[30,90]},suppliers:[{id,name,lead_days,safety_days,version}],items:[Recommendation]}
Recommendation {obat_id,code,name,unit,supplier_id,supplier_name,stock,expired_stock,usable_stock,batch_stock,batches:[{id,batch_number,purchase_date,expiry_date,quantity_remaining}],oldest_batch,expiring_batches,history_start,history_limited,clinic:{units30,units90,transactions30,transactions90},external:{units30,units90,transactions30,transactions90},daily_demand,trend_percent,days_remaining,lead_days,safety_days,reorder_point,target_stock,recommended_quantity,priority:'urgent'|'order'|'enough'|'manual',fast_moving,warnings:[string],reasons:[string],transactions:[{reference_type,reference_id,date,quantity,status,valid}],supplier_costs:[{supplier_id,cost_price,purchase_date}],estimated_unit_cost,cost_source:'supplier_purchase'|'default_estimate'|'unknown',default_cost_price,analysis_fingerprint,active_drafts:[{id,supplier_id}]}
GET /order-settings -> data supplier list above.
PUT /order-settings/:supplierId body {lead_days,safety_days,version}; optimistic version (initial 0). Returns supplier setting. Input integer days 0..365.

GET /order-drafts?status=draft|archived -> data [{id,supplier_id,supplier_name,status,version,notes,created_by,created_at,updated_at,item_count}]
GET /order-drafts/:id -> data {...header,items:[{obat_id,code,name,unit,quantity,recommended_quantity,estimated_unit_cost,cost_source,notes,analysis:Recommendation}],audit:[{action,actor,created_at}]}
POST /order-drafts body {request_key:UUID,notes,items:[{obat_id,supplier_id,quantity,notes,analysis_fingerprint}]}; groups into one draft per supplier atomically, returns data {drafts:[{id,supplier_id}],replayed:boolean}. Persist idempotency keyed by actor+request_key with payload hash; different payload same key ->409.
PUT /order-drafts/:id body {version,notes,items:[same selection fields]}; one supplier must match existing draft. Return saved detail. Optimistic conflict code VERSION_CONFLICT.
POST /order-drafts/:id/archive body {version}; returns {id,version,status:'archived'}.
GET /order-drafts/:id/export -> Excel attachment. Frontend print uses saved detail rendered safely in popup.

Save recalculates recommendations (including cost at selected supplier via exported forSupplier(item,id)); compares submitted analysis_fingerprint against this selected-supplier recommendation. 409 ANALYSIS_CHANGED data {items:[fresh selected-supplier recommendations]} before writing; frontend shows new evidence but retains user quantities and explicitly lets user retry. Initial selection supplier override: GET /order-recommendations?supplier_id=ID recalculates all recommendations for that supplier (used to update edited item only). Generate endpoint accepts no arbitrary parameter overrides.

## Service boundary
OrderRecommendationService exports class with static async generate({supplierId=null,now=new Date(),connection=null}={}), returning full recommendation data. Uses supplied transaction connection when provided, otherwise lazy require('../db'). Pure exported helpers under class: analyze({obat,batches,movements,sources,historyStart,suppliers,activeDrafts,asOf}), periods(now), forSupplier(item,supplierId,suppliers). Sources are normalized records keyed by reference_type:reference_id:obat_id. Implementing root will communicate exact helper input through tests. Draft service calls generate({connection}), then forSupplier(item,supplierId,analysis.suppliers).

Ruling: limited history uses later of medication creation and earliest inventory movement date (not first sale), conservatively warning where observation is not proven. Full-window divisors remain 30/90; manual review blocks bulk selection, not deliberate human selection.
Ruling: demand only counts valid negative sale movements matching source totals across all dates; cancellation, returns, unmatched sources or quantity anomalies go to manual with excluded ambiguous movement. Draft/test movements are excluded, observed anomalous stock writes are warnings. Expiring soon means next 60 days; expired means date before as_of. Cost missing is null, never zero-cost claim.

## Verification before deployment
50 tests in six suites passed, including unchanged Sunday Clinic billing/payment regression tests; staff static check passed with cache v400. Browser fixture proved actual tab/selection/save events, escaping, preserved inventory form and unsaved edits. Independent review findings (stale duplicate badges and inactive-supplier error status) fixed and re-reviewed without further actionable findings.

Actual MariaDB tests on isolated schema codex_order_qa_20260914 passed concurrent idempotency, divergent replay rejection, saved detail/audit, concurrent edit/settings conflicts, changed-analysis rejection, Excel roundtrip, archive and unchanged inventory hash. Sanitized snapshot yielded 55 items: 7 urgent, 4 order, 9 enough, 35 manual, 9 fast moving; valid 90-day units: external 8805, clinic 11040. These are audit-time values, not fixed product defaults.
