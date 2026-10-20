/**
 * FreshPath Link - Terminal Database Reset (Preserves Hardware & Owners)
 * Run with: npm run clear-db
 *
 * SAFETY GUARD:
 * - Registered Hardware Devices in `devices` are NEVER deleted.
 * - Hardware GPS Unit documents (e.g. `gpsUnits/GPS-01`) are STRICTLY PRESERVED.
 * - Hardware-bound Mandi documents (e.g. `mandis/mandi-panruti-01` with `STORE-01`) are STRICTLY PRESERVED.
 * - Hardware-bound Vehicle documents (e.g. `vehicles/veh-tn31-01` with `GPS-01`) are STRICTLY PRESERVED.
 * - Root Owner account and registered owners/admins in `users` & `owners` are STRICTLY PRESERVED.
 * - Hardware device user accounts (*@freshpath.device) are STRICTLY PRESERVED.
 * - Only demo test crates, trips, events, farmer fields, purchases, retail shops, and non-owner test users are wiped.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

const OWNER_EMAIL = 'tonightgamermrjk@gmail.com';
const ROOT_OWNER_UID = 'oMl0ziVO7aWj9MH26ocPGH41fG12';
const PROJECT_ID = 'freshpath-link';

const KNOWN_DEVICE_UIDS = ['10Ea8IJb0IcE1vWwuDsH9Wwul4P2', 'k8ePyHigtQRcmQe6tSuoY2qIMdd2'];
const KNOWN_DEVICE_UNIT_IDS = ['GPS-01', 'STORE-01'];

function request(method, pathUrl, accessToken, postData = null) {
  return new Promise((resolve, reject) => {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };
    if (postData) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(
      {
        hostname: 'firestore.googleapis.com',
        path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${pathUrl}`,
        method,
        headers,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve({});
          }
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function listDocs(collectionName, accessToken) {
  const res = await request('GET', collectionName, accessToken);
  return res.documents || [];
}

async function deleteDoc(docPath, accessToken) {
  return request('DELETE', docPath, accessToken);
}

async function patchDoc(docPath, data, accessToken) {
  return request('PATCH', docPath, accessToken, JSON.stringify(data));
}

async function main() {
  console.log('\n=================================================================');
  console.log(' 🧹 FreshPath Link - Database Purge (Preserves Hardware & Owners)');
  console.log('=================================================================\n');

  // 1. Read access token
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (!fs.existsSync(configPath)) {
    console.error('❌ Firebase tools config not found. Please run: firebase login');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const accessToken = config.tokens?.access_token;
  if (!accessToken) {
    console.error('❌ No access token found. Please run: firebase login');
    process.exit(1);
  }

  // 2. Discover registered devices and hardware unit IDs
  console.log('📡 Discovering hardware devices and owners to protect...');
  const protectedDeviceUids = new Set(KNOWN_DEVICE_UIDS);
  const protectedUnitIds = new Set(KNOWN_DEVICE_UNIT_IDS);
  const protectedOwnerUids = new Set([ROOT_OWNER_UID]);

  try {
    const deviceDocs = await listDocs('devices', accessToken);
    deviceDocs.forEach((d) => {
      const uid = d.name.split('/').pop();
      if (uid) protectedDeviceUids.add(uid);
      const unitId = d.fields?.unitId?.stringValue;
      if (unitId) protectedUnitIds.add(unitId);
    });

    const ownerDocs = await listDocs('owners', accessToken);
    ownerDocs.forEach((o) => {
      const uid = o.name.split('/').pop();
      if (uid) protectedOwnerUids.add(uid);
    });
  } catch (err) {
    console.warn('⚠️ Note during discovery:', err.message);
  }

  console.log(`   Protected Device UIDs: ${Array.from(protectedDeviceUids).join(', ')}`);
  console.log(`   Protected Unit IDs:    ${Array.from(protectedUnitIds).join(', ')}`);
  console.log(`   Protected Owner UIDs:   ${Array.from(protectedOwnerUids).join(', ')}\n`);

  let deletedCount = 0;

  // 3. Purge telemetry readings subcollections under mandis
  console.log('⏳ Purging telemetry reading subcollections...');
  try {
    const mandis = await listDocs('mandis', accessToken);
    for (const m of mandis) {
      const mId = m.name.split('/').pop();
      const readings = await listDocs(`mandis/${mId}/readings`, accessToken);
      for (const r of readings) {
        const rPath = r.name.split('/documents/').pop();
        await deleteDoc(rPath, accessToken);
        deletedCount++;
      }
    }
  } catch (err) {
    console.warn('   Readings purge note:', err.message);
  }

  // 4. Purge standard temporary collections
  const collectionsToClear = [
    'bags',
    'trips',
    'events',
    'fields',
    'storageUnits',
    'shops',
    'purchases',
    'counters',
  ];

  for (const col of collectionsToClear) {
    try {
      const docs = await listDocs(col, accessToken);
      for (const d of docs) {
        const relPath = d.name.split('/documents/').pop();
        await deleteDoc(relPath, accessToken);
        deletedCount++;
      }
      if (docs.length > 0) {
        console.log(`   Deleted ${docs.length} document(s) from "${col}".`);
      }
    } catch (err) {
      console.warn(`   Notice clearing ${col}:`, err.message);
    }
  }

  // 5. Selectively handle Mandis (Preserve hardware-bound mandis)
  try {
    const mandis = await listDocs('mandis', accessToken);
    for (const m of mandis) {
      const mId = m.name.split('/').pop();
      const nodeUnitId = m.fields?.nodeUnitId?.stringValue;
      const isBoundToHardware = (nodeUnitId && protectedUnitIds.has(nodeUnitId)) || mId === 'mandi-panruti-01';

      if (isBoundToHardware) {
        // Reset telemetry baseline but PRESERVE document
        await patchDoc(`mandis/${mId}`, {
          fields: {
            ...m.fields,
            currentTemp: { doubleValue: 14.2 },
            currentHumidity: { doubleValue: 88.0 },
          },
        }, accessToken);
        console.log(`   🛡️  Preserved hardware Mandi: "${m.fields?.name?.stringValue || mId}" (nodeUnitId: ${nodeUnitId})`);
      } else {
        const relPath = m.name.split('/documents/').pop();
        await deleteDoc(relPath, accessToken);
        deletedCount++;
      }
    }
  } catch (err) {
    console.warn('   Notice checking mandis:', err.message);
  }

  // 6. Selectively handle Vehicles (Preserve hardware-bound vehicles)
  try {
    const vehicles = await listDocs('vehicles', accessToken);
    for (const v of vehicles) {
      const vId = v.name.split('/').pop();
      const gpsUnitId = v.fields?.gpsUnitId?.stringValue;
      const isBoundToHardware = (gpsUnitId && protectedUnitIds.has(gpsUnitId)) || vId === 'veh-tn31-01';

      if (isBoundToHardware) {
        console.log(`   🛡️  Preserved hardware Vehicle: "${v.fields?.regNumber?.stringValue || vId}" (gpsUnitId: ${gpsUnitId})`);
      } else {
        const relPath = v.name.split('/documents/').pop();
        await deleteDoc(relPath, accessToken);
        deletedCount++;
      }
    }
  } catch (err) {
    console.warn('   Notice checking vehicles:', err.message);
  }

  // 7. Selectively handle GPS Units (Preserve registered hardware GPS units)
  try {
    const gpsUnits = await listDocs('gpsUnits', accessToken);
    for (const g of gpsUnits) {
      const gId = g.name.split('/').pop();
      const isRegisteredUnit = protectedUnitIds.has(gId) || gId === 'GPS-01';

      if (isRegisteredUnit) {
        // Reset fix status but PRESERVE document
        await patchDoc(`gpsUnits/${gId}`, {
          fields: {
            ...g.fields,
            latest: {
              mapValue: {
                fields: {
                  valid: { booleanValue: false },
                  sats: { integerValue: '0' },
                  hdop: { doubleValue: 99.99 },
                  speedKmph: { doubleValue: 0.0 },
                },
              },
            },
          },
        }, accessToken);
        console.log(`   🛡️  Preserved hardware GPS Unit: "${gId}"`);
      } else {
        const relPath = g.name.split('/documents/').pop();
        await deleteDoc(relPath, accessToken);
        deletedCount++;
      }
    }
  } catch (err) {
    console.warn('   Notice checking gpsUnits:', err.message);
  }

  // 8. Selectively handle Users (Preserve owners, admins, and hardware devices)
  try {
    const users = await listDocs('users', accessToken);
    for (const u of users) {
      const uid = u.name.split('/').pop();
      const fields = u.fields || {};
      const email = fields.email?.stringValue?.toLowerCase() || '';
      const role = fields.role?.stringValue;

      const isOwner =
        email === OWNER_EMAIL.toLowerCase() ||
        uid === ROOT_OWNER_UID ||
        protectedOwnerUids.has(uid) ||
        role === 'owner' ||
        role === 'admin';

      const isDevice =
        email.endsWith('@freshpath.device') ||
        email.includes('.device') ||
        protectedDeviceUids.has(uid);

      if (isOwner) {
        console.log(`   🛡️  Preserved Owner User: ${email || uid}`);
      } else if (isDevice) {
        console.log(`   📱 Preserved Hardware Device User: ${email || uid}`);
      } else {
        const relPath = u.name.split('/documents/').pop();
        await deleteDoc(relPath, accessToken);
        deletedCount++;
      }
    }
  } catch (err) {
    console.warn('   Notice checking users:', err.message);
  }

  console.log('\n-----------------------------------------------------------------');
  console.log(`✅ SUCCESS! Database purge complete. Deleted ${deletedCount} document(s).`);
  console.log('   Hardware Devices, Mandi STORE-01, Vehicle GPS-01, and Owner accounts strictly preserved.');
  console.log('-----------------------------------------------------------------\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
