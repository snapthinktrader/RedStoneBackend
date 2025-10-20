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
  
  // 1. IP Address (3 points) - Strongest signal
  if (storedFP.ip_address === incomingFP.ip) {
    score += 3;
  }
  
  // 2. GPU Renderer (5 points) - Very strong signal
  if (storedFP.gpu_renderer && incomingFP.gpu) {
    if (storedFP.gpu_renderer === incomingFP.gpu) {
      score += 5;
    } else if (fuzzyMatch(storedFP.gpu_renderer, incomingFP.gpu)) {
      score += 3; // Partial credit for fuzzy match
    }
  }
  
  // 3. Screen Resolution (2 points)
  if (storedFP.screen_resolution && incomingFP.resolution) {
    if (storedFP.screen_resolution === incomingFP.resolution) {
      score += 2;
    } else if (sameAspectRatio(storedFP.screen_resolution, incomingFP.resolution)) {
      score += 1; // Partial credit for same aspect ratio
    }
  }
  
  // 4. User Agent / Device similarity (2 points)
  if (storedFP.user_agent && incomingFP.user_agent) {
    if (fuzzyMatch(storedFP.user_agent, incomingFP.user_agent)) {
      score += 2;
    }
  }
  
  // 5. Timezone (1 point)
  if (storedFP.timezone && incomingFP.timezone && storedFP.timezone === incomingFP.timezone) {
    score += 1;
  }
  
  // 6. Language (1 point)
  if (storedFP.language && incomingFP.language && storedFP.language === incomingFP.language) {
    score += 1;
  }
  
  return score;
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
    console.log('📱 Incoming fingerprint:', {
      ip: fingerprint.ip,
      gpu: fingerprint.gpu,
      resolution: fingerprint.resolution,
      user_agent: fingerprint.user_agent?.substring(0, 50),
      timezone: fingerprint.timezone,
      language: fingerprint.language
    });
    
    // Score each candidate
    let bestMatch = null;
    let highestScore = 0;
    
    for (const candidate of candidates) {
      console.log(`\n📊 Comparing with candidate ${candidate._id}:`);
      console.log('   Stored:', {
        ip: candidate.ip_address,
        gpu: candidate.gpu_renderer,
        resolution: candidate.screen_resolution,
        user_agent: candidate.user_agent?.substring(0, 50),
        timezone: candidate.timezone,
        language: candidate.language
      });
      
      const score = calculateMatchScore(candidate, fingerprint);
      
      console.log(`  ➡️ Score: ${score}/15 points (${((score/15)*100).toFixed(0)}%)`);
      
      if (score > highestScore) {
        highestScore = score;
        bestMatch = candidate;
      }
    }
    
    // Calculate confidence (0-1)
    const confidence = highestScore / 15;
    const CONFIDENCE_THRESHOLD = 0.6; // 60% = 9/15 points
    
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
      console.log(`⚠️ No confident match (best: ${(confidence * 100).toFixed(0)}%, threshold: 60%)`);
      
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
