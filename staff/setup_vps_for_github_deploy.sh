#!/usr/bin/env bash
# Run on the VPS (Ubuntu 24.04) as a user with sudo privileges.
# Usage: sudo bash setup_vps_for_github_deploy.sh [deploy_user] [deploy_dir]
# Example: sudo bash setup_vps_for_github_deploy.sh deploy /var/www/myapp

set -euo pipefail

DEPLOY_USER="${1:-deploy}"
DEPLOY_DIR="${2:-/var/www/myapp}"
SSH_DIR="/home/${DEPLOY_USER}/.ssh"

echo "==> Creating deploy user '${DEPLOY_USER}' (if not exists) and setting up directory ${DEPLOY_DIR}..."
if ! id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
  sudo adduser --disabled-password --gecos "" "${DEPLOY_USER}"
  echo "Created user ${DEPLOY_USER}."
else
  echo "User ${DEPLOY_USER} already exists."
fi

echo "==> Creating .ssh for ${DEPLOY_USER}..."
sudo mkdir -p "${SSH_DIR}"
sudo chown "${DEPLOY_USER}:${DEPLOY_USER}" "${SSH_DIR}"
sudo chmod 700 "${SSH_DIR}"

PUBKEY_PATH="${SSH_DIR}/github_actions_deploy.pub"
AUTH_KEYS="${SSH_DIR}/authorized_keys"

if [ ! -f "${PUBKEY_PATH}" ]; then
  echo "# Place the GitHub Actions public key here (paste contents) and save to ${PUBKEY_PATH}"
  echo "# Example: echo 'ssh-ed25519 AAAA....' | sudo tee ${PUBKEY_PATH}"
  echo
  echo "No public key file created automatically because the Actions key must be supplied by you."
  echo "When you have the Actions public key text, run:"
  echo "  echo 'PASTE_PUBKEY' | sudo tee ${PUBKEY_PATH}"
  echo "  sudo sh -c 'cat ${PUBKEY_PATH} >> ${AUTH_KEYS}'"
  echo "  sudo chown ${DEPLOY_USER}:${DEPLOY_USER} ${PUBKEY_PATH} ${AUTH_KEYS}"
  echo "  sudo chmod 600 ${AUTH_KEYS}"
else
  echo "Public key file ${PUBKEY_PATH} already exists."
fi

echo
echo "==> Creating deploy directory ${DEPLOY_DIR} (if not exists) and setting ownership to ${DEPLOY_USER}..."
sudo mkdir -p "${DEPLOY_DIR}"
sudo chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_DIR}"

echo
echo "==> (Optional) Prepare a bare repo + post-receive hook if you want push-to-deploy instead of pull:"
echo "  mkdir -p /home/${DEPLOY_USER}/git && sudo chown ${DEPLOY_USER}:${DEPLOY_USER} /home/${DEPLOY_USER}/git"
echo "  sudo -u ${DEPLOY_USER} git init --bare /home/${DEPLOY_USER}/git/myapp.git"
echo "  # Create /home/${DEPLOY_USER}/git/myapp.git/hooks/post-receive to checkout to ${DEPLOY_DIR}"
echo

echo "==> Summary / next steps:"
echo "1) Create an SSH keypair for GitHub Actions (on your workstation):"
echo "   ssh-keygen -t ed25519 -f actions_deploy_key -N '' -C 'github-actions-deploy'"
echo "   This creates 'actions_deploy_key' (private) and 'actions_deploy_key.pub' (public)."
echo
echo "2) Copy the public key to the VPS 'deploy' user's authorized_keys:"
echo "   On your workstation, run:"
echo "     ssh-copy-id -i actions_deploy_key.pub ${DEPLOY_USER}@your.vps.ip"
echo "   OR manually paste actions_deploy_key.pub contents into:"
echo "     sudo tee ${PUBKEY_PATH}  (then append to ${AUTH_KEYS} and set perms as above)"
echo
echo "3) Add the private key (actions_deploy_key) to your GitHub repo's Secrets:"
echo "   - Repo → Settings → Secrets and variables → Actions → New repository secret"
echo "   - Name: SSH_DEPLOY_KEY"
echo "   - Value: contents of actions_deploy_key (private key)"
echo
echo "4) Update .github/workflows/deploy-to-vps.yml (host, user, deploy_dir, branch) as needed."
echo
echo "Done. The script created directories and printed next steps. Paste the Actions public key into the VPS authorized_keys as described."