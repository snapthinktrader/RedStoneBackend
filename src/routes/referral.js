const express = require('express');
const router = express.Router();
const FingerprintSession = require('../models/FingerprintSession');
const User = require('../models/User');

/**
 * Helper function to calculate match score between two fingerprints
 * Maximum score: 15 points
 */
function calculateMatchScore(storedFP, incomingFP) {
  let score = 0;
  const maxScore = 10; // Total points
  
  console.log(`\n  🔍 ENHANCED FINGERPRINT ANALYSIS (fingerprintchat.txt optimized):`);
  console.log(`     📱 Stored (Web Browser):`);
  console.log(`        IP: "${storedFP.ip_address}"`);
  console.log(`        Timezone: "${storedFP.timezone}"`);
  console.log(`        Language: "${storedFP.language}"`);
  console.log(`        User Agent: "${storedFP.user_agent?.substring(0, 80)}..."`);
  console.log(`     📱 Incoming (Mobile App):`);
  console.log(`        IP: "${incomingFP.ip}"`);
  console.log(`        Timezone: "${incomingFP.timezone}"`);
  console.log(`        Language: "${incomingFP.language}"`);
  console.log(`        Platform: "${incomingFP.platform}"`);
  console.log(`        User Agent: "${incomingFP.user_agent?.substring(0, 80)}..."`);
  
  // PRIORITY 1: Platform/OS Detection (4 points = 40%) - MOST RELIABLE
  // From fingerprintchat.txt: "This is your most powerful signal"
  const webIsAndroid = storedFP.user_agent?.toLowerCase().includes('android') || false;
  const appIsAndroid = incomingFP.user_agent?.toLowerCase().includes('android') || 
                       incomingFP.platform?.toLowerCase().includes('android') || false;
  
  if (webIsAndroid && appIsAndroid) {
    score += 4;
    console.log(`     ✅ PLATFORM: Both Android detected (40 points) - STRONG MATCH`);
  } else {
    console.log(`     ❌ PLATFORM: Mismatch - Web:${webIsAndroid ? 'Android' : 'Non-Android'}, App:${appIsAndroid ? 'Android' : 'Non-Android'}`);
  }
  
  // PRIORITY 2: Timezone (3 points = 30%) - Very Stable
  // From fingerprintchat.txt: "Extremely stable. Rarely changes unless they travel"
  if (storedFP.timezone && incomingFP.timezone) {
    const normalizedStored = normalizeTimezone(storedFP.timezone);
    const normalizedIncoming = normalizeTimezone(incomingFP.timezone);
    
    if (normalizedStored === normalizedIncoming) {
      score += 3;
      console.log(`     ✅ TIMEZONE: Perfect match (30 points) - "${normalizedStored}"`);
    } else {
      console.log(`     ❌ TIMEZONE: Different - Web:"${normalizedStored}" vs App:"${normalizedIncoming}"`);
    }
  } else {
    console.log(`     ⚠️ TIMEZONE: Missing data - Web:"${storedFP.timezone}" vs App:"${incomingFP.timezone}"`);
  }
  
  // PRIORITY 3: Language Primary Code (2 points = 20%) - Stable  
  // From fingerprintchat.txt: "Compare the primary language subtag (the 'en' part)"
  if (storedFP.language && incomingFP.language) {
    // Extract primary language code: en-US → en, en_IN → en
    const webLangCode = storedFP.language.split('-')[0].split('_')[0].toLowerCase();
    const appLangCode = incomingFP.language.split('-')[0].split('_')[0].toLowerCase();
    
    if (webLangCode === appLangCode) {
      score += 2;
      console.log(`     ✅ LANGUAGE: Primary code match (20 points) - "${webLangCode}" (Web:${storedFP.language}, App:${incomingFP.language})`);
    } else {
      console.log(`     ❌ LANGUAGE: Different primary codes - Web:"${webLangCode}" vs App:"${appLangCode}"`);
    }
  } else {
    console.log(`     ⚠️ LANGUAGE: Missing data - Web:"${storedFP.language}" vs App:"${incomingFP.language}"`);
  }
  
  // LOW-PRIORITY BONUS: IP Address (1 point = 10%) - Unreliable
  // From fingerprintchat.txt: "Only use it to add a small bonus... A mismatch should not cause failure"
  if (storedFP.ip_address === incomingFP.ip) {
    score += 1;
    console.log(`     ⚡ IP BONUS: Exact match (10 points) - "${incomingFP.ip}"`);
  } else if (sameIPSubnet(storedFP.ip_address, incomingFP.ip)) {
    score += 0.5;
    console.log(`     ⚡ IP BONUS: Same subnet (5 points) - ${storedFP.ip_address} ↔ ${incomingFP.ip}`);
  } else {
    console.log(`     ❌ IP: Different networks - "${storedFP.ip_address}" vs "${incomingFP.ip}" (no bonus)`);
  }
  
  // EXPLICITLY IGNORED (per fingerprintchat.txt):
  // ❌ GPU Renderer: "Browser and native app report this differently"
  // ❌ Screen Resolution: "Browser viewport ≠ mobile screen" 
  // ❌ Full User Agent: "Completely different formats"
  
  const percentage = Math.round((score / maxScore) * 100);
  const normalizedScore = (score / maxScore) * 15;
  
  console.log(`  📊 ENHANCED SCORE: ${score.toFixed(1)}/${maxScore} = ${percentage}% confidence`);
  console.log(`     🎯 Breakdown: Platform(40%) + Timezone(30%) + Language(20%) + IP Bonus(10%)`);
  console.log(`     📈 Normalized: ${normalizedScore.toFixed(1)}/15 (Threshold: 4.35/15 = 29%)`);
  console.log(`     ${normalizedScore >= 4.35 ? '✅ ABOVE THRESHOLD - MATCH!' : '❌ Below threshold - No match'}`);
  
  return normalizedScore;
}

/**
 * Check if two IPs are in the same subnet (for mobile network switching)
 */
function sameIPSubnet(ip1, ip2) {
  if (!ip1 || !ip2) return false;
  
  // Check if first 3 octets match (Class C subnet)
  const octets1 = ip1.split('.');
  const octets2 = ip2.split('.');
  
  if (octets1.length !== 4 || octets2.length !== 4) return false;
  
  return octets1[0] === octets2[0] && 
         octets1[1] === octets2[1] && 
         octets1[2] === octets2[2];
}

/**
 * Normalize timezone names (handle aliases)
 * Asia/Calcutta = Asia/Kolkata (same timezone, different names)
 */
function normalizeTimezone(tz) {
  if (!tz) return '';
  
  const timezoneAliases = {
    'Asia/Calcutta': 'Asia/Kolkata',
    'Asia/Kathmandu': 'Asia/Katmandu',
    'America/Montreal': 'America/Toronto',
    // Add more aliases as needed
  };
  
  return timezoneAliases[tz] || tz;
}

/**
 * Fuzzy string matching - checks if strings share common significant terms
 */
function fuzzyMatch(str1, str2) {
  if (!str1 || !str2) return false;
  
  const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
  
  const terms1 = normalize(str1);
  const terms2 = normalize(str2);
  
  // Find common terms
  const commonTerms = terms1.filter(term => 
    terms2.some(t => t.includes(term) || term.includes(t))
  );
  
  // Calculate similarity ratio
  const similarity = commonTerms.length / Math.max(terms1.length, terms2.length);
  
  return similarity >= 0.4; // 40% similarity threshold
}

/**
 * Check if two screen resolutions have the same aspect ratio
 */
function sameAspectRatio(res1, res2) {
  if (!res1 || !res2) return false;
  
  const parseRes = (res) => {
    const parts = res.split('x').map(Number);
    return parts.length === 2 ? parts : null;
  };
  
  const [w1, h1] = parseRes(res1) || [];
  const [w2, h2] = parseRes(res2) || [];
  
  if (!w1 || !h1 || !w2 || !h2) return false;
  
  const ratio1 = w1 / h1;
  const ratio2 = w2 / h2;
  
  // Allow 5% tolerance
  return Math.abs(ratio1 - ratio2) / ratio1 < 0.05;
}

/**
 * POST /api/referral/log-fingerprint
 * Store fingerprint when user visits landing page with ref_code
 */
router.post('/log-fingerprint', async (req, res) => {
  try {
    const { referral_code, referrer_name, fingerprint } = req.body;
    
    // Validate required fields
    if (!referral_code || !fingerprint) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: referral_code and fingerprint'
      });
    }
    
    // Find the user who owns this referral code
    const referrer = await User.findOne({ referralCode: referral_code });
    
    if (!referrer) {
      return res.status(404).json({
        success: false,
        error: 'Invalid referral code'
      });
    }
    
    // Determine referrer name
    const referrerFullName = referrer_name || 
      referrer.name ||
      referrer.email;
    
    // Create fingerprint session with 30-minute expiration
    const session = await FingerprintSession.create({
      referral_code,
      referrer_id: referrer._id,
      referrer_name: referrerFullName,
      ip_address: fingerprint.ip || 'unknown',
      device_id: fingerprint.device_id || null,
      device_name: fingerprint.device_name || null,
      device_model: fingerprint.device_model || null,
      device_manufacturer: fingerprint.device_manufacturer || null,
      gpu_renderer: fingerprint.gpu || 'unknown',
      screen_resolution: fingerprint.resolution || 'unknown',
      user_agent: fingerprint.user_agent || req.headers['user-agent'] || 'unknown',
      timezone: fingerprint.timezone || 'unknown',
      language: fingerprint.language || 'unknown',
      status: 'pending',
      expires_at: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
    });
    
    console.log('✅ Fingerprint logged:', {
      session_id: session._id,
      referral_code,
      referrer_name: referrerFullName,
      ip: fingerprint.ip
    });
    
    res.json({
      success: true,
      message: 'Fingerprint logged successfully',
      session_id: session._id
    });
    
  } catch (error) {
    console.error('❌ Error logging fingerprint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * POST /api/referral/log-download
 * Update session status when user downloads APK through referral link
 * Only called when user came from referral link and clicks download
 */
router.post('/log-download', async (req, res) => {
  try {
    const { referral_code, fingerprint } = req.body;
    
    if (!referral_code || !fingerprint) {
      return res.status(400).json({
        success: false,
        error: 'Missing referral_code or fingerprint data'
      });
    }
    
    console.log(`📥 Download logged for referral code: ${referral_code}`);
    
    // Find most recent session with matching referral code
    const session = await FingerprintSession.findOne({
      referral_code,
      status: 'pending',
      expires_at: { $gt: new Date() }
    }).sort({ created_at: -1 });
    
    if (session) {
      // Update existing session to "downloaded"
      session.status = 'downloaded';
      session.download_timestamp = new Date();
      session.download_fingerprint = fingerprint;
      await session.save();
      
      console.log(`✅ Session updated to downloaded: ${session._id}`);
      return res.json({ 
        success: true, 
        session_id: session._id,
        message: 'Download logged successfully'
      });
    }
    
    // No pending session found - need to look up referrer and create new session
    const User = require('../models/User');
    const referrer = await User.findOne({ referralCode: referral_code });
    
    if (!referrer) {
      return res.status(404).json({
        success: false,
        error: 'Invalid referral code'
      });
    }
    
    const referrerFullName = `${referrer.name || 'Unknown'}`.trim();
    
    // Create new session marked as downloaded
    const newSession = await FingerprintSession.create({
      referral_code,
      referrer_id: referrer._id,
      referrer_name: referrerFullName,
      ip_address: fingerprint.ip || 'unknown',
      device_id: fingerprint.device_id || null,
      device_name: fingerprint.device_name || null,
      device_model: fingerprint.device_model || null,
      device_manufacturer: fingerprint.device_manufacturer || null,
      gpu_renderer: fingerprint.gpu || 'unknown',
      screen_resolution: fingerprint.resolution || 'unknown',
      user_agent: fingerprint.user_agent || 'unknown',
      timezone: fingerprint.timezone || 'unknown',
      language: fingerprint.language || 'unknown',
      status: 'downloaded',
      download_timestamp: new Date(),
      download_fingerprint: fingerprint,
      expires_at: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
    });
    
    console.log(`✅ New download session created: ${newSession._id}`);
    res.json({ 
      success: true, 
      session_id: newSession._id,
      message: 'Download logged successfully'
    });
    
  } catch (error) {
    console.error('❌ Error logging download:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * POST /api/referral/find-match
 * Match app fingerprint with stored web fingerprints
 * Returns referrer info if confidence > 60%
 */
router.post('/find-match', async (req, res) => {
  try {
    const { fingerprint } = req.body;
    
    if (!fingerprint) {
      return res.status(400).json({
        success: false,
        error: 'Missing fingerprint data'
      });
    }
    
    // Clean up expired sessions first
    await FingerprintSession.cleanupExpired();
    
    // PRIORITIZE downloaded sessions (higher accuracy)
    let candidates = await FingerprintSession.find({
      status: 'downloaded',
      expires_at: { $gt: new Date() }
    }).sort({ download_timestamp: -1 }); // Most recent download first
    
    console.log(`📊 Found ${candidates.length} downloaded sessions`);
    
    // If no downloaded sessions, fall back to pending
    if (candidates.length === 0) {
      candidates = await FingerprintSession.find({
        status: 'pending',
        expires_at: { $gt: new Date() }
      }).sort({ created_at: -1 });
      
      console.log(`📊 Falling back to ${candidates.length} pending sessions`);
    }
    
    if (candidates.length === 0) {
      console.log('ℹ️ No fingerprint sessions found');
      return res.json({
        match_found: false,
        confidence: 0,
        message: 'No referral sessions found'
      });
    }
    
    console.log(`🔍 Matching against ${candidates.length} candidate(s)...`);
    console.log('📱 INCOMING FINGERPRINT (from mobile app):');
    console.log('   Raw fingerprint object:', JSON.stringify(fingerprint, null, 2));
    console.log('   Parsed data:', {
      ip: fingerprint.ip,
      gpu: fingerprint.gpu,
      resolution: fingerprint.resolution,
      user_agent: fingerprint.user_agent?.substring(0, 100),
      timezone: fingerprint.timezone,
      language: fingerprint.language,
      platform: fingerprint.platform
    });
    
    // Score each candidate
    let bestMatch = null;
    let highestScore = 0;
    
    for (const candidate of candidates) {
      console.log(`\n📊 Comparing with candidate ${candidate._id}:`);
      console.log('   🌐 STORED FINGERPRINT (from web browser):');
      console.log('      ip_address:', candidate.ip_address);
      console.log('      gpu_renderer:', candidate.gpu_renderer);
      console.log('      screen_resolution:', candidate.screen_resolution);
      console.log('      user_agent:', candidate.user_agent?.substring(0, 100));
      console.log('      timezone:', candidate.timezone);
      console.log('      language:', candidate.language);
      console.log('      status:', candidate.status);
      console.log('      created_at:', candidate.created_at);
      
      // SHORT-CIRCUIT MATCHES (Exact identity signals)
      // 1) device_id exact match (mobile->web)
      if (fingerprint.device_id && candidate.device_id && fingerprint.device_id === candidate.device_id) {
        console.log('   🔒 DEVICE ID EXACT MATCH - short-circuiting with 100% confidence');
        bestMatch = candidate;
        highestScore = 15; // full points
        break;
      }

      // 2) device_name or model exact match (strong signal)
      if (fingerprint.device_name && candidate.device_name && fingerprint.device_name === candidate.device_name) {
        console.log('   🔒 DEVICE NAME EXACT MATCH - short-circuiting with 100% confidence');
        bestMatch = candidate;
        highestScore = 15;
        break;
      }

      // 3) exact IP address match (strong enough to accept)
      if (candidate.ip_address && fingerprint.ip && candidate.ip_address === fingerprint.ip) {
        console.log('   🔒 IP EXACT MATCH - short-circuiting with 100% confidence');
        bestMatch = candidate;
        highestScore = 15;
        break;
      }

      // Otherwise fall back to scoring
      const score = calculateMatchScore(candidate, fingerprint);
      console.log(`  ➡️ Score: ${score}/15 points (${((score/15)*100).toFixed(0)}%)`);

      if (score > highestScore) {
        highestScore = score;
        bestMatch = candidate;
      }
    }
    
    // Calculate confidence (0-1)
    const confidence = highestScore / 15;
    const CONFIDENCE_THRESHOLD = 0.29; // 29% = 4.35/15 points
    
    if (confidence >= CONFIDENCE_THRESHOLD && bestMatch) {
      // Update match confidence in the session
      bestMatch.match_confidence = confidence;
      await bestMatch.save();
      
      console.log('✅ Match found:', {
        session_id: bestMatch._id,
        referrer_name: bestMatch.referrer_name,
        referral_code: bestMatch.referral_code,
        confidence: `${(confidence * 100).toFixed(0)}%`,
        score: `${highestScore}/15`
      });
      
      res.json({
        match_found: true,
        confidence: parseFloat(confidence.toFixed(2)),
        referrer_name: bestMatch.referrer_name,
        referral_code: bestMatch.referral_code,
        session_id: bestMatch._id
      });
    } else {
      console.log(`⚠️ No confident match (best: ${(confidence * 100).toFixed(0)}%, threshold: 29%)`);
      
      res.json({
        match_found: false,
        confidence: parseFloat(confidence.toFixed(2)),
        message: 'No matching referral found with sufficient confidence'
      });
    }
    
  } catch (error) {
    console.error('❌ Error finding match:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * POST /api/referral/confirm-match
 * User confirms or rejects the suggested referral match
 */
router.post('/confirm-match', async (req, res) => {
  try {
    const { session_id, confirmed } = req.body;
    
    if (!session_id || confirmed === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: session_id and confirmed'
      });
    }
    
    // Find the session
    const session = await FingerprintSession.findById(session_id);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    if (session.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: `Session already ${session.status}`
      });
    }
    
    if (confirmed) {
      // User confirmed the match
      await session.confirm();
      
      console.log('✅ User confirmed referral:', {
        session_id: session._id,
        referral_code: session.referral_code,
        referrer_name: session.referrer_name
      });
      
      res.json({
        success: true,
        message: 'Referral confirmed successfully',
        referral_code: session.referral_code,
        referrer_name: session.referrer_name
      });
    } else {
      // User rejected the match
      await session.reject();
      
      console.log('❌ User rejected referral:', {
        session_id: session._id,
        referral_code: session.referral_code
      });
      
      res.json({
        success: true,
        message: 'User will enter code manually'
      });
    }
    
  } catch (error) {
    console.error('❌ Error confirming match:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/referral/stats (Optional - for debugging)
 * Get referral session statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = {
      total: await FingerprintSession.countDocuments(),
      pending: await FingerprintSession.countDocuments({ status: 'pending' }),
      confirmed: await FingerprintSession.countDocuments({ status: 'confirmed' }),
      rejected: await FingerprintSession.countDocuments({ status: 'rejected' }),
      expired: await FingerprintSession.countDocuments({ status: 'expired' })
    };
    
    // Get recent sessions
    const recentSessions = await FingerprintSession.find()
      .sort({ created_at: -1 })
      .limit(10)
      .select('referral_code referrer_name status match_confidence created_at expires_at');
    
    res.json({
      success: true,
      stats,
      recent_sessions: recentSessions
    });
    
  } catch (error) {
    console.error('❌ Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

module.exports = router;
