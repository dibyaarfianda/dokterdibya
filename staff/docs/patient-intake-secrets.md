# Patient Intake Encryption Key Propagation

The patient intake API, CLI review tooling, and import scripts all rely on the same AES-256 key pair:

- `INTAKE_ENCRYPTION_KEY`
- `INTAKE_ENCRYPTION_KEY_ID`

Keep the values identical everywhere the intake records are written or read. The key **must** be a 32-byte value encoded in base64 (for example the string generated via `openssl rand -base64 32`).

## Runtime environments

| Environment | What to do |
| --- | --- |
| Local development / VPS | Add both variables to `backend/.env` (already committed) and restart with `pm2 restart dibyaklinik-backend --update-env`. |
| PM2 ecosystem files | If you maintain an `ecosystem.config.js`, copy both variables into `env` and `env_production`. Restart with `--update-env`. |
| Docker / Kubernetes | Add the variables to the container environment (Compose `environment`, K8s `Secret` + `envFrom` ConfigMap etc.). Roll the deployment to refresh pods. |

## GitHub Actions / CI jobs

If GitHub Actions (or any CI pipeline) runs `backend/scripts/review-patient-intake.js` or `backend/scripts/import-patient-intake.js`, add the same values to the workflow secrets so decrypt/read operations succeed:

1. Repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Create secrets named `INTAKE_ENCRYPTION_KEY` and `INTAKE_ENCRYPTION_KEY_ID` with the values from production.
3. In the workflow YAML, expose them to the job environment:

   ```yaml
   env:
     INTAKE_ENCRYPTION_KEY: ${{ secrets.INTAKE_ENCRYPTION_KEY }}
     INTAKE_ENCRYPTION_KEY_ID: ${{ secrets.INTAKE_ENCRYPTION_KEY_ID }}
   ```

## Key rotation

1. Generate a new base64 key.
2. Update the variables in **all** environments.
3. Increment `INTAKE_ENCRYPTION_KEY_ID`.
4. Re-save any records that still use the old key (e.g., open each submission via the review endpoint and save) before deleting the previous key material.

Keep a secure record of the current key ID and value in your password vault. Do not commit the actual secret to source control.
