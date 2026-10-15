/**
 * FreshPath Link - Purge Non-Owner Firebase Authentication Accounts
 * Run with: npm run purge-auth
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync } = require('child_process');

const OWNER_EMAIL = 'tonightgamermrjk@gmail.com';
const PROJECT_ID = 'freshpath-link';

async function main() {
  console.log('\n======================================================');
  console.log(' 🔐 FreshPath Link - Purging Non-Owner Auth Users');
  console.log('======================================================\n');

  // 1. Export current accounts using firebase-tools
  const tempExportPath = path.join(os.tmpdir(), `freshpath-auth-export-${Date.now()}.json`);
  console.log('⏳ Exporting accounts from Firebase Auth...');
  
  try {
    execSync(`npx firebase auth:export "${tempExportPath}" --project ${PROJECT_ID}`, {
      stdio: 'pipe',
    });
  } catch (err) {
    console.error('Failed to export auth users via firebase CLI:', err.message);
    process.exit(1);
  }

  if (!fs.existsSync(tempExportPath)) {
    console.log('No export file produced.');
    process.exit(0);
  }

  const exportData = JSON.parse(fs.readFileSync(tempExportPath, 'utf8'));
  const users = exportData.users || [];
  fs.unlinkSync(tempExportPath);

  const nonOwnerUids = users
    .filter((u) => u.email !== OWNER_EMAIL && u.localId !== 'oMl0ziVO7aWj9MH26ocPGH41fG12')
    .map((u) => u.localId);

  if (nonOwnerUids.length === 0) {
    console.log('✅ Firebase Authentication is already clean! Only the Owner account exists:');
    console.log(` - ${OWNER_EMAIL} (UID: oMl0ziVO7aWj9MH26ocPGH41fG12)\n`);
    process.exit(0);
  }

  console.log(`Found ${nonOwnerUids.length} non-owner account(s) to delete:`);
  users
    .filter((u) => nonOwnerUids.includes(u.localId))
    .forEach((u) => console.log(` - ${u.email || 'No email'} (UID: ${u.localId})`));

  // 2. Read access token from firebase-tools config
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    console.error('Firebase tools config not found at', configPath);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const accessToken = config.tokens?.access_token;
  if (!accessToken) {
    console.error('No access token found in firebase-tools config. Please run: firebase login');
    process.exit(1);
  }

  // 3. Batch delete non-owner accounts via Identity Toolkit API
  console.log('\n⏳ Deleting non-owner accounts via Google Identity Toolkit API...');
  const postData = JSON.stringify({
    localIds: nonOwnerUids,
    force: true,
  });

  const req = https.request(
    {
      hostname: 'identitytoolkit.googleapis.com',
      path: `/v1/projects/${PROJECT_ID}/accounts:batchDelete`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    },
    (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`\n✅ SUCCESS! Deleted ${nonOwnerUids.length} account(s) from Firebase Authentication.`);
          console.log(`Owner account strictly preserved: ${OWNER_EMAIL}\n`);
          process.exit(0);
        } else {
          console.error(`\n❌ API error (Status ${res.statusCode}):`, body);
          process.exit(1);
        }
      });
    }
  );

  req.on('error', (e) => {
    console.error('Request failed:', e.message);
    process.exit(1);
  });

  req.write(postData);
  req.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
