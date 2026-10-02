import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as Cesium from 'cesium';
import {
  GOOGLE_CREDIT_IMAGE_URL,
  configureCesiumNetworkDefaults,
} from './google3d.js';

function restoreSdkDefaults(t) {
  const token = Cesium.Ion.defaultAccessToken;
  const credit = Cesium.GoogleMaps.getDefaultCredit;
  t.after(() => {
    Cesium.Ion.defaultAccessToken = token;
    Cesium.GoogleMaps.getDefaultCredit = credit;
  });
}

test('without an ion token the SDK demo token is cleared so implicit ion calls fail closed', (t) => {
  restoreSdkDefaults(t);
  assert.notEqual(Cesium.Ion.defaultAccessToken, '');
  configureCesiumNetworkDefaults(Cesium);
  assert.equal(Cesium.Ion.defaultAccessToken, '');
});

test('a configured ion token becomes the SDK default', (t) => {
  restoreSdkDefaults(t);
  configureCesiumNetworkDefaults(Cesium, { cesiumToken: ' ion-fixture ' });
  assert.equal(Cesium.Ion.defaultAccessToken, 'ion-fixture');
});

test('the Google 3D Tiles credit keeps the logo but loads it from this server', (t) => {
  restoreSdkDefaults(t);
  assert.match(
    Cesium.GoogleMaps.getDefaultCredit().html,
    /assets\.ion\.cesium\.com/,
  );
  configureCesiumNetworkDefaults(Cesium);
  const credit = Cesium.GoogleMaps.getDefaultCredit();
  assert.equal(credit.showOnScreen, true);
  assert.match(credit.html, /alt="Google"/);
  assert.ok(credit.html.includes(`src="${GOOGLE_CREDIT_IMAGE_URL}"`));
  assert.doesNotMatch(credit.html, /https?:/);
});

test('the bundled Google credit image is served from public/', () => {
  assert.ok(
    existsSync(
      new URL(`../../public${GOOGLE_CREDIT_IMAGE_URL}`, import.meta.url),
    ),
  );
});
