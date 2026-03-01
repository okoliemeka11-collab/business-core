// flywheel.js - LoopDraft Data Flywheel Engine
// Every user interaction improves the next draft automatically.
// Zero server required. All intelligence lives in localStorage.

const Flywheel = (() => {
  const STORAGE_KEY = 'ld_voice_profile';

  const defaultProfile = () => ({
    version: '1.0',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    draftCount: 0,
    publishCount: 0,
    copyCount: 0,
    regenerateCount: 0,
    topicClusters: {},
    preferredLength: 'medium',
    toneScore: 0.5,
    retainedStructures: {},
    engagementTier: 'new',
    affiliateEligible: false,
    proConversionSignal: false,
  });

  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : defaultProfile();
    } catch { return defaultProfile(); }
  };

  const save = (profile) => {
    profile.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  };

  const onDraftGenerated = (topic) => {
    const p = load();
    p.draftCount++;
    const clusters = ['saas','ai','marketing','seo','content','startup','growth','product','email','automation','writing'];
    const words = topic.toLowerCase().split(/\s+/);
    words.forEach(w => clusters.forEach(c => {
      if (w.includes(c)) p.topicClusters[c] = (p.topicClusters[c] || 0) + 1;
    }));
    if (p.draftCount >= 20) p.engagementTier = 'power';
    else if (p.draftCount >= 8) p.engagementTier = 'active';
    else if (p.draftCount >= 3) p.engagementTier = 'casual';
    if (p.draftCount >= 5) p.proConversionSignal = true;
    if (p.draftCount >= 15) p.affiliateEligible = true;
    save(p);
    return p;
  };

  const onDraftKept = (structures = [], tone = 0.5) => {
    const p = load();
    p.copyCount++;
    structures.forEach(s => { p.retainedStructures[s] = (p.retainedStructures[s] || 0) + 1; });
    p.toneScore = p.toneScore * 0.8 + tone * 0.2;
    save(p);
    return p;
  };

  const onRegenerate = () => {
    const p = load();
    p.regenerateCount++;
    p._expandVariations = (p.regenerateCount / Math.max(p.draftCount, 1)) > 0.3;
    save(p);
    return p;
  };

  const onPublish = () => {
    const p = load();
    p.publishCount++;
    if (p.publishCount >= 3) p.affiliateEligible = true;
    save(p);
    return p;
  };

  const getPersonalizationContext = () => {
    const p = load();
    const topNiche = Object.entries(p.topicClusters).sort((a,b) => b[1]-a[1])[0]?.[0] || null;
    const preferredStructures = Object.entries(p.retainedStructures).sort((a,b) => b[1]-a[1]).slice(0,3).map(e => e[0]);
    const tone = p.toneScore < 0.35 ? 'casual and conversational'
               : p.toneScore > 0.65 ? 'professional and authoritative'
               : 'balanced and direct';
    return { topNiche, preferredStructures, tone, engagementTier: p.engagementTier,
             proConversionSignal: p.proConversionSignal, affiliateEligible: p.affiliateEligible,
             draftCount: p.draftCount, expandVariations: p._expandVariations || false };
  };

  return { onDraftGenerated, onDraftKept, onRegenerate, onPublish,
           getPersonalizationContext, shouldShowProModal: () => load().proConversionSignal,
           shouldShowAffiliateOffer: () => load().affiliateEligible, getProfile: load };
})();
