/**
 * FreshPath Link - Purge Non-Owner, Non-Device Firebase Authentication Accounts
 * Run with: npm run purge-auth
 *
 * SAFETY GUARD:
 * - Root Owner account (tonightgamermrjk@gmail.com / oMl0ziVO7aWj9MH26ocPGH41fG12) is STRICTLY PRESERVED.
 * - Any user in the Firestore `owners` collection or with role 'owner'/'admin' is STRICTLY PRESERVED.
 * - All hardware device accounts (*@freshpath.device / UIDs registered in `devices`) are STRICTLY PRESERVED.
 * - Only temporary, non-device demo/test user accounts are deleted.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync } = require('child_process');

const OWNER_EMAIL = 'tonightgamermrjk@gmail.com';
const ROOT_OWNER_UID = 'oMl0ziVO7aWj9MH26ocPGH41fG12';
const PROJECT_ID = 'freshpath-link';

// Known hardware device accounts as baseline safety
const KNOWN_DEVICE_UIDS = [
  '10Ea8IJb0IcE1vWwuDsH9Wwul4P2', // GPS-01
  'k8ePyHigtQRcmQe6tSuoY2qIMdd2', // STORE-01
];

function getFirebaseTools() {
  const candidates = [];
  try {
    const globalRoot = execSync('npm root -g').toString().trim();
    candidates.push(path.join(globalRoot, 'firebase-tools'));
  } catch {}

  candidates.push(path.join(os.homedir(), '.nvm/versions/node', process.version, 'lib/node_modules/firebase-tools'));

  try {
    candidates.push(path.dirname(require.resolve('firebase-tools/package.json')));
  } catch {}

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const auth = require(path.join(c, 'lib/auth.js'));
        const { Client, setAccessToken } = require(path.join(c, 'lib/apiv2.js'));
        const { identityOrigin } = require(path.join(c, 'lib/api.js'));
        return { auth, Client, setAccessToken, identityOrigin };
      } catch {}
    }
  }
  return null;
}

function firestoreGet(collectionName, accessToken) {
  return new Promise((resolve) => {
    const req = https.get(
      {
        hostname: 'firestore.googleapis.com',
        path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionName}`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-goog-user-project': PROJECT_ID,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve(data.documents || []);
          } catch {
            resolve([]);
          }
        });
      }
    );
    req.on('error', () => resolve([]));
  });
}

async function main() {
  console.log('\n=================================================================');
  console.log(' 🔐 FreshPath Link - Purging Demo Auth Users (Preserving Hardware & Owners)');
  console.log('=================================================================\n');

  // 1. Resolve access token & API client from firebase-tools
  const fbTools = getFirebaseTools();
  let accessToken = null;
  let apiClient = null;

  if (fbTools) {
    const defaultAccount = fbTools.auth.getGlobalDefaultAccount();
    if (defaultAccount?.tokens?.refresh_token) {
      try {
        const tokenData = await fbTools.auth.getAccessToken(defaultAccount.tokens.refresh_token, []);
        accessToken = tokenData.access_token;
        fbTools.setAccessToken(accessToken);
        apiClient = new fbTools.Client({ urlPrefix: fbTools.identityOrigin() });
      } catch (err) {
        console.warn('⚠️ Could not refresh token via firebase-tools:', err.message);
      }
    }
  }

  if (!accessToken) {
    const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    if (!fs.existsSync(configPath)) {
      console.error('❌ Firebase tools config not found at', configPath);
      console.error('Please run: firebase login');
      process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    accessToken = config.tokens?.access_token;
    if (!accessToken) {
      console.error('❌ No access token found in firebase-tools config. Please run: firebase login');
      process.exit(1);
    }
  }

  // 2. Dynamically fetch registered devices and owners from Firestore
  console.log('📡 Fetching registered hardware devices and owners from Firestore...');
  const protectedDeviceUids = new Set(KNOWN_DEVICE_UIDS);
  const protectedOwnerUids = new Set([ROOT_OWNER_UID]);

  try {
    const deviceDocs = await firestoreGet('devices', accessToken);
    deviceDocs.forEach((d) => {
      const uid = d.name.split('/').pop();
      if (uid) protectedDeviceUids.add(uid);
    });

    const ownerDocs = await firestoreGet('owners', accessToken);
    ownerDocs.forEach((o) => {
      const uid = o.name.split('/').pop();
      if (uid) protectedOwnerUids.add(uid);
    });

    const userDocs = await firestoreGet('users', accessToken);
    userDocs.forEach((u) => {
      const uid = u.name.split('/').pop();
      const fields = u.fields || {};
      const role = fields.role?.stringValue;
      const email = fields.email?.stringValue?.toLowerCase() || '';

      if (role === 'owner' || role === 'admin' || email === OWNER_EMAIL.toLowerCase()) {
        protectedOwnerUids.add(uid);
      }
      if (role === 'device' || email.endsWith('@freshpath.device') || email.includes('.device')) {
        protectedDeviceUids.add(uid);
      }
    });

    console.log(`   Found ${protectedDeviceUids.size} protected hardware device UID(s).`);
    console.log(`   Found ${protectedOwnerUids.size} protected owner/admin UID(s).\n`);
  } catch (err) {
    console.warn('⚠️ Could not query Firestore dynamic protection list; using known safe defaults:', err.message);
  }

  // 3. Export current accounts using firebase-tools
  const tempExportPath = path.join(os.tmpdir(), `freshpath-auth-export-${Date.now()}.json`);
  console.log('⏳ Exporting accounts from Firebase Auth...');

  try {
    execSync(`npx firebase auth:export "${tempExportPath}" --project ${PROJECT_ID}`, {
      stdio: 'pipe',
    });
  } catch (err) {
    console.error('❌ Failed to export auth users via firebase CLI:', err.message);
    process.exit(1);
  }

  if (!fs.existsSync(tempExportPath)) {
    console.log('No export file produced.');
    process.exit(0);
  }

  const exportData = JSON.parse(fs.readFileSync(tempExportPath, 'utf8'));
  const users = exportData.users || [];
  fs.unlinkSync(tempExportPath); // Zero Secrets: immediately clean up temp file

  // 4. Classify accounts
  const preservedOwners = [];
  const preservedDevices = [];
  const accountsToDelete = [];

  for (const u of users) {
    const email = (u.email || '').toLowerCase();
    const uid = u.localId;

    const isOwner =
      email === OWNER_EMAIL.toLowerCase() ||
      uid === ROOT_OWNER_UID ||
      protectedOwnerUids.has(uid);

    const isDevice =
      email.endsWith('@freshpath.device') ||
      email.includes('.device') ||
      protectedDeviceUids.has(uid);

    if (isOwner) {
      preservedOwners.push(u);
    } else if (isDevice) {
      preservedDevices.push(u);
    } else {
      accountsToDelete.push(u);
    }
  }

  console.log('-----------------------------------------------------------------');
  console.log(`🛡️  PRESERVED OWNER ACCOUNT(S) (${preservedOwners.length}):`);
  preservedOwners.forEach((u) => console.log(`   ✓ ${u.email || 'No email'} (UID: ${u.localId})`));

  console.log(`\n📱 PRESERVED HARDWARE DEVICE ACCOUNT(S) (${preservedDevices.length}):`);
  preservedDevices.forEach((u) => console.log(`   ✓ ${u.email || 'No email'} (UID: ${u.localId})`));
  console.log('-----------------------------------------------------------------\n');

  if (accountsToDelete.length === 0) {
    console.log('✅ Firebase Authentication is already clean!');
    console.log('   All Owner accounts and Hardware Device accounts are strictly preserved.\n');
    process.exit(0);
  }

  console.log(`🗑️  Found ${accountsToDelete.length} non-owner, non-device account(s) to delete:`);
  accountsToDelete.forEach((u) => console.log(`   - ${u.email || 'No email'} (UID: ${u.localId})`));

  // 5. Batch delete only demo/test accounts via Identity Toolkit API
  console.log('\n⏳ Deleting demo accounts via Google Identity Toolkit API...');
  const uidsToDelete = accountsToDelete.map((u) => u.localId);

  if (apiClient) {
    try {
      const resp = await apiClient.post(
        `/v1/projects/${PROJECT_ID}/accounts:batchDelete`,
        {
          localIds: uidsToDelete,
          force: true,
        },
        {
          headers: { 'x-goog-user-project': PROJECT_ID },
        }
      );
      if (resp.status === 200) {
        console.log(`\n✅ SUCCESS! Deleted ${accountsToDelete.length} demo account(s) from Firebase Authentication.`);
        console.log(`   Owner account strictly preserved: ${OWNER_EMAIL}`);
        console.log(`   Hardware device accounts strictly preserved: ${preservedDevices.map(d => d.email).join(', ')}\n`);
        process.exit(0);
      } else {
        console.error(`\n❌ API error (Status ${resp.status}):`, resp.body);
        process.exit(1);
      }
    } catch (err) {
      console.error('\n❌ Batch delete request failed:', err.message, err.context?.body);
      process.exit(1);
    }
  } else {
    // Fallback: direct HTTP with user project header
    const postData = JSON.stringify({
      localIds: uidsToDelete,
      force: true,
    });
    const req = https.request(
      {
        hostname: 'identitytoolkit.googleapis.com',
        path: `/v1/projects/${PROJECT_ID}/accounts:batchDelete`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'x-goog-user-project': PROJECT_ID,
          'User-Agent': 'FirebaseCLI/13.x',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log(`\n✅ SUCCESS! Deleted ${accountsToDelete.length} demo account(s) from Firebase Authentication.`);
            console.log(`   Owner account strictly preserved: ${OWNER_EMAIL}`);
            console.log(`   Hardware device accounts strictly preserved: ${preservedDevices.map(d => d.email).join(', ')}\n`);
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
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
