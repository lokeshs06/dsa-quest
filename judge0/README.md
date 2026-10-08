# Judge0 Deployment Guide (v1.13.1)

Based on the official [Judge0 Deployment Procedure](https://github.com/judge0/judge0/blob/master/CHANGELOG.md#deployment-procedure).

---

## 1. Deploying on a Cloud Server / VPS (Ubuntu 22.04 LTS Recommended)

### System Requirements & Kernel Setup (CRITICAL)
Judge0 uses Linux cgroups and `isolate` to sandbox code execution. On modern Linux (e.g. Ubuntu 22.04+), disable the unified cgroup v2 hierarchy:

1. Open GRUB config:
   ```bash
   sudo nano /etc/default/grub
   ```
2. Add `systemd.unified_cgroup_hierarchy=0` to `GRUB_CMDLINE_LINUX`:
   ```bash
   GRUB_CMDLINE_LINUX="systemd.unified_cgroup_hierarchy=0"
   ```
3. Update GRUB and reboot:
   ```bash
   sudo update-grub
   sudo reboot
   ```
4. Install Docker & Docker Compose if not already installed:
   ```bash
   sudo apt-get update
   sudo apt-get install -y docker.io docker-compose-v2
   sudo systemctl enable --now docker
   ```

### Running the Services
1. Upload or copy this `judge0/` folder to your server:
   ```bash
   cd judge0
   ```
2. `deploy.sh` creates `judge0.conf` from `judge0.conf.example` with freshly generated `REDIS_PASSWORD` and `POSTGRES_PASSWORD` the first time it runs. `judge0.conf` is kept out of git because it holds those passwords.
3. Run the automated deployment script:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```
   Or run manually:
   ```bash
   docker compose up -d db redis
   sleep 10s
   docker compose up -d
   ```
4. Check health:
   ```bash
   curl http://localhost:2358/system_info
   ```
   Interactive Swagger documentation is available at `http://<YOUR_SERVER_IP>:2358/docs`.

---

## 2. Connecting DSA Quest to your Judge0 Instance

Once your Judge0 server is running:

In your `server/.env` file:
```env
# If running locally on Docker Desktop:
JUDGE0_URL=http://localhost:2358

# If running on a cloud VPS:
JUDGE0_URL=http://<YOUR_SERVER_IP_OR_DOMAIN>:2358
```

If you configured authentication in `judge0.conf` via `AUTHN_TOKEN` (DSA Quest sends it as the `X-Auth-Token` header), add:
```env
JUDGE0_API_KEY=your_auth_token
```

Restart your DSA Quest backend server (`npm run dev` in `server/`). The warning banner will disappear and the **Run** button will immediately execute code using your Judge0 deployment!
