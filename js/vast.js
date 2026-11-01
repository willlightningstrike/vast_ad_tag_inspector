// Extracts ads, creatives, trackers, media files and verifications from a <VAST> element.
(function (root) {
  const X = typeof module !== 'undefined' ? require('./xml.js') : root.AdInspector;
  const { childElements, firstChild, descendants, text, attr } = X;

  const CLICK_TRACKERS = [
    'ClickThrough', 'ClickTracking', 'CustomClick',
    'IconClickThrough', 'IconClickTracking', 'IconViewTracking',
    'CompanionClickThrough', 'CompanionClickTracking',
    'NonLinearClickThrough', 'NonLinearClickTracking',
  ];
  const RESOURCES = ['StaticResource', 'IFrameResource', 'HTMLResource'];

  function within(el, localName, stop) {
    for (let p = el.parentNode; p && p !== stop; p = p.parentNode) {
      if (p.localName === localName) return true;
    }
    return false;
  }

  function bitrate(el) {
    const b = attr(el, 'bitrate');
    if (b) return b;
    const min = attr(el, 'minBitrate');
    const max = attr(el, 'maxBitrate');
    return min && max ? `${min}–${max}` : null;
  }

  function universalAdId(creative) {
    const u = firstChild(creative, 'UniversalAdId') ||
      descendants(firstChild(creative, 'CreativeExtensions'), 'UniversalAdId')[0];
    if (!u) return null;
    const value = text(u) || attr(u, 'idValue');
    const registry = attr(u, 'idRegistry');
    return registry ? `${registry}: ${value}` : value;
  }

  function creativeKind(creative) {
    if (firstChild(creative, 'Linear')) return 'Linear';
    const nonLinear = childElements(firstChild(creative, 'NonLinearAds'), 'NonLinear');
    if (nonLinear.length) return `NonLinear ×${nonLinear.length}`;
    const companions = childElements(firstChild(creative, 'CompanionAds'), 'Companion');
    if (companions.length) {
      const sizes = companions.map((c) => `${attr(c, 'width')}x${attr(c, 'height')}`);
      return `Companion ×${companions.length} (${sizes.join(', ')})`;
    }
    return 'Unknown';
  }

  function mediaRow(el, kind, resourceType, adId, creativeId, sizeFrom) {
    const full = text(el);
    let url = full;
    if (resourceType === 'HTMLResource' && url && url.length > 120) url = url.slice(0, 120) + '…';
    return {
      adId, creativeId, kind, resourceType,
      type: attr(el, 'type') || attr(el, 'creativeType'),
      delivery: attr(el, 'delivery'),
      width: attr(sizeFrom || el, 'width'),
      height: attr(sizeFrom || el, 'height'),
      bitrate: bitrate(el),
      codec: attr(el, 'codec'),
      apiFramework: attr(el, 'apiFramework'),
      url, full,
    };
  }

  function extractVast(vastEl, ctx) {
    const out = {
      version: attr(vastEl, 'version'),
      adCount: 0, podAdCount: 0, fallbackAdCount: 0, creativeCount: 0,
      creativeRows: [], trackers: [], mediaFiles: [], verifications: [],
    };
    const place = { breakId: ctx.breakId, timeOffset: ctx.timeOffset, position: ctx.position };
    const track = (type, el, adId, creativeId) => {
      const url = text(el);
      if (url) out.trackers.push({ type, url, adId, creativeId, breakId: ctx.breakId });
    };

    for (const e of childElements(vastEl, 'Error')) track('Error', e, null, null);

    // Ads with a sequence form an ad pod. When there is a pod, the ads without one are
    // fallbacks the player can use if a pod ad fails; without a pod they are standalone.
    const ads = childElements(vastEl, 'Ad');
    const hasPod = ads.some((ad) => attr(ad, 'sequence'));

    for (const ad of ads) {
      out.adCount++;
      const adId = attr(ad, 'id');
      const sequence = attr(ad, 'sequence');
      const role = sequence ? `Pod #${sequence}` : hasPod ? 'Fallback' : 'Standalone';
      if (sequence) out.podAdCount++;
      else if (hasPod) out.fallbackAdCount++;
      const body = firstChild(ad, 'InLine') || firstChild(ad, 'Wrapper');
      const adType = body ? body.localName : null;
      const row = (extra) => Object.assign({
        ...place, adId, adType, sequence, role, creativeId: null, adIdAttr: null, universalAdId: null,
        kind: null, duration: null, url: null, fallbackOnNoAd: null, placeholder: false,
      }, extra);
      if (!body) {
        out.creativeRows.push(row({ kind: 'no InLine or Wrapper', placeholder: true }));
        continue;
      }

      for (const name of ['Impression', 'Error']) {
        for (const e of childElements(body, name)) track(name, e, adId, null);
      }
      const viewable = firstChild(body, 'ViewableImpression');
      for (const name of ['Viewable', 'NotViewable', 'ViewUndetermined']) {
        for (const e of childElements(viewable, name)) track(name, e, adId, null);
      }

      const creatives = childElements(firstChild(body, 'Creatives'), 'Creative');
      if (adType === 'Wrapper') {
        out.creativeRows.push(row({
          kind: 'Wrapper → VASTAdTagURI (not fetched)',
          url: text(firstChild(body, 'VASTAdTagURI')),
          fallbackOnNoAd: attr(body, 'fallbackOnNoAd'),
          placeholder: true,
        }));
      } else if (creatives.length === 0) {
        out.creativeRows.push(row({ kind: 'no creatives', placeholder: true }));
      }

      for (const c of creatives) {
        const creativeId = attr(c, 'id');
        out.creativeCount++;
        const linear = firstChild(c, 'Linear');
        out.creativeRows.push(row({
          creativeId,
          adIdAttr: attr(c, 'AdID') || attr(c, 'adId'),
          universalAdId: universalAdId(c),
          kind: creativeKind(c),
          duration: text(firstChild(linear, 'Duration')),
        }));

        for (const t of descendants(c, 'Tracking')) {
          if (!within(t, 'Verification', c)) track(`Tracking: ${attr(t, 'event') || '(no event)'}`, t, adId, creativeId);
        }
        for (const name of CLICK_TRACKERS) {
          for (const e of descendants(c, name)) track(name, e, adId, creativeId);
        }

        for (const m of descendants(linear, 'MediaFile')) out.mediaFiles.push(mediaRow(m, 'Linear', 'MediaFile', adId, creativeId));
        for (const m of descendants(linear, 'Mezzanine')) out.mediaFiles.push(mediaRow(m, 'Mezzanine', 'Mezzanine', adId, creativeId));
        const holders = [
          ['NonLinear', childElements(firstChild(c, 'NonLinearAds'), 'NonLinear')],
          ['Companion', childElements(firstChild(c, 'CompanionAds'), 'Companion')],
        ];
        for (const [kind, list] of holders) {
          for (const holder of list) {
            for (const rt of RESOURCES) {
              for (const r of childElements(holder, rt)) out.mediaFiles.push(mediaRow(r, kind, rt, adId, creativeId, holder));
            }
          }
        }
      }

      for (const ext of childElements(firstChild(body, 'Extensions'), 'Extension')) {
        for (const t of descendants(ext, 'Tracking')) {
          if (!within(t, 'Verification', ext)) track(`Extension: ${attr(ext, 'type') || '(no type)'}`, t, adId, null);
        }
      }

      for (const v of descendants(ad, 'Verification')) {
        const resources = [];
        for (const rt of ['JavaScriptResource', 'ExecutableResource']) {
          for (const r of childElements(v, rt)) {
            resources.push({ resourceType: rt, apiFramework: attr(r, 'apiFramework'), url: text(r) });
          }
        }
        const trackers = [];
        for (const t of descendants(v, 'Tracking')) {
          const event = attr(t, 'event') || '(no event)';
          const url = text(t);
          if (!url) continue;
          trackers.push({ event, url });
          track(`Verification: ${event}`, t, adId, null);
        }
        out.verifications.push({
          adId, vendor: attr(v, 'vendor'), resources,
          parameters: text(firstChild(v, 'VerificationParameters')), trackers,
        });
      }
    }
    return out;
  }

  const api = { extractVast };
  root.AdInspector = Object.assign(root.AdInspector || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
