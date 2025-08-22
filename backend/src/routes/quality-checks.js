const express = require('express');
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Perform quality check on document
router.post('/document/:documentId/check', authenticateToken, async (req, res) => {
  try {
    const { documentId } = req.params;

    // Check document ownership
    const docResult = await db.query(`
      SELECT ed.*, wt.title as task_title
      FROM entry_documents ed
      JOIN wiki_tasks wt ON ed.task_id = wt.id
      WHERE ed.id = $1
    `, [documentId]);
    
    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = docResult.rows[0];
    
    if (document.writer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get related content
    const [apiResult, notebookResult] = await Promise.all([
      db.query('SELECT * FROM entry_api_configs WHERE document_id = $1', [documentId]),
      db.query('SELECT * FROM entry_notebooks WHERE document_id = $1', [documentId])
    ]);

    const apiConfigs = apiResult.rows;
    const notebooks = notebookResult.rows;

    // Perform quality checks
    const checks = await performQualityChecks(document, apiConfigs, notebooks);
    
    // Save check results
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      
      // Clear previous checks
      await client.query('DELETE FROM quality_checks WHERE document_id = $1', [documentId]);
      
      // Insert new checks
      for (const check of checks) {
        await client.query(`
          INSERT INTO quality_checks (document_id, check_type, status, message, details, score)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [documentId, check.type, check.status, check.message, JSON.stringify(check.details), check.score]);
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Calculate overall score
    const overallScore = calculateOverallScore(checks);
    const hasBlockingIssues = checks.some(check => check.status === 'error');

    res.json({
      checks,
      overall_score: overallScore,
      can_submit: !hasBlockingIssues && overallScore >= 60,
      blocking_issues: checks.filter(check => check.status === 'error'),
      warnings: checks.filter(check => check.status === 'warning'),
      passed: checks.filter(check => check.status === 'pass')
    });
  } catch (error) {
    console.error('Error performing quality check:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get quality check history for document
router.get('/document/:documentId/history', authenticateToken, async (req, res) => {
  try {
    const { documentId } = req.params;

    // Check document access
    const docCheck = await db.query(`
      SELECT ed.writer_id, wt.writer1_id, wt.writer2_id, wt.code_annotator_id
      FROM entry_documents ed
      JOIN wiki_tasks wt ON ed.task_id = wt.id
      WHERE ed.id = $1
    `, [documentId]);
    
    if (docCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docCheck.rows[0];
    const canAccess = req.user.role === 'admin' || 
                     req.user.id === doc.writer_id || 
                     req.user.id === doc.writer1_id || 
                     req.user.id === doc.writer2_id || 
                     req.user.id === doc.code_annotator_id;

    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(`
      SELECT * FROM quality_checks 
      WHERE document_id = $1 
      ORDER BY checked_at DESC
    `, [documentId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching quality check history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Quality check implementation
async function performQualityChecks(document, apiConfigs, notebooks) {
  const checks = [];

  // 1. Document content checks
  checks.push(...checkDocumentContent(document));
  
  // 2. API configuration checks
  checks.push(...checkApiConfigurations(apiConfigs));
  
  // 3. Notebook checks
  checks.push(...checkNotebooks(notebooks));
  
  // 4. Integration checks
  checks.push(...checkIntegration(document, apiConfigs, notebooks));

  return checks;
}

function checkDocumentContent(document) {
  const checks = [];
  const content = document.content || '';
  const title = document.title || '';

  // Check title
  if (!title || title.trim() === '' || title === 'Untitled Document') {
    checks.push({
      type: 'document_title',
      status: 'error',
      message: 'Document must have a meaningful title',
      details: { current_title: title },
      score: 0
    });
  } else {
    checks.push({
      type: 'document_title',
      status: 'pass',
      message: 'Document has a valid title',
      details: { title_length: title.length },
      score: 100
    });
  }

  // Check content length
  if (content.length < 100) {
    checks.push({
      type: 'content_length',
      status: 'error',
      message: 'Document content is too short (minimum 100 characters)',
      details: { current_length: content.length, minimum_required: 100 },
      score: 0
    });
  } else if (content.length < 500) {
    checks.push({
      type: 'content_length',
      status: 'warning',
      message: 'Document content could be more comprehensive',
      details: { current_length: content.length, recommended_minimum: 500 },
      score: 60
    });
  } else {
    checks.push({
      type: 'content_length',
      status: 'pass',
      message: 'Document content has adequate length',
      details: { content_length: content.length },
      score: 100
    });
  }

  // Check for required sections
  const requiredSections = ['overview', 'implementation', 'usage'];
  const foundSections = [];
  
  requiredSections.forEach(section => {
    const regex = new RegExp(`#.*${section}`, 'i');
    if (regex.test(content)) {
      foundSections.push(section);
    }
  });

  if (foundSections.length === 0) {
    checks.push({
      type: 'document_structure',
      status: 'warning',
      message: 'Consider adding structured sections (Overview, Implementation, Usage)',
      details: { found_sections: foundSections, recommended_sections: requiredSections },
      score: 40
    });
  } else {
    checks.push({
      type: 'document_structure',
      status: 'pass',
      message: `Document has good structure with ${foundSections.length} key sections`,
      details: { found_sections: foundSections },
      score: 80 + (foundSections.length * 6)
    });
  }

  // Check for code blocks
  const codeBlockCount = (content.match(/```/g) || []).length / 2;
  if (codeBlockCount === 0) {
    checks.push({
      type: 'code_examples',
      status: 'warning',
      message: 'Consider adding code examples to illustrate implementation',
      details: { code_blocks_found: 0 },
      score: 50
    });
  } else {
    checks.push({
      type: 'code_examples',
      status: 'pass',
      message: `Document includes ${codeBlockCount} code examples`,
      details: { code_blocks_found: codeBlockCount },
      score: Math.min(100, 70 + (codeBlockCount * 10))
    });
  }

  return checks;
}

function checkApiConfigurations(apiConfigs) {
  const checks = [];

  if (apiConfigs.length === 0) {
    checks.push({
      type: 'api_coverage',
      status: 'error',
      message: 'No API test configurations found. At least one API test is required.',
      details: { config_count: 0 },
      score: 0
    });
  } else {
    checks.push({
      type: 'api_coverage',
      status: 'pass',
      message: `${apiConfigs.length} API test configurations provided`,
      details: { config_count: apiConfigs.length },
      score: Math.min(100, 60 + (apiConfigs.length * 20))
    });

    // Check API config completeness
    let completeConfigs = 0;
    let incompleteConfigs = [];

    apiConfigs.forEach(config => {
      const isComplete = config.name && 
                        config.method && 
                        config.endpoint && 
                        config.expected_status;
      
      if (isComplete) {
        completeConfigs++;
      } else {
        incompleteConfigs.push({
          id: config.id,
          name: config.name,
          missing: []
        });
        
        if (!config.name) incompleteConfigs[incompleteConfigs.length - 1].missing.push('name');
        if (!config.method) incompleteConfigs[incompleteConfigs.length - 1].missing.push('method');
        if (!config.endpoint) incompleteConfigs[incompleteConfigs.length - 1].missing.push('endpoint');
        if (!config.expected_status) incompleteConfigs[incompleteConfigs.length - 1].missing.push('expected_status');
      }
    });

    if (incompleteConfigs.length > 0) {
      checks.push({
        type: 'api_completeness',
        status: 'warning',
        message: `${incompleteConfigs.length} API configurations are incomplete`,
        details: { incomplete_configs: incompleteConfigs },
        score: Math.max(30, 100 - (incompleteConfigs.length * 20))
      });
    } else {
      checks.push({
        type: 'api_completeness',
        status: 'pass',
        message: 'All API configurations are complete',
        details: { complete_count: completeConfigs },
        score: 100
      });
    }
  }

  return checks;
}

function checkNotebooks(notebooks) {
  const checks = [];

  if (notebooks.length === 0) {
    checks.push({
      type: 'notebook_coverage',
      status: 'warning',
      message: 'No use case scripts provided. Consider adding practical examples.',
      details: { notebook_count: 0 },
      score: 50
    });
  } else {
    checks.push({
      type: 'notebook_coverage',
      status: 'pass',
      message: `${notebooks.length} use case script(s) provided`,
      details: { notebook_count: notebooks.length },
      score: Math.min(100, 70 + (notebooks.length * 15))
    });

    // Check notebook content quality
    let qualityScores = [];
    
    notebooks.forEach(notebook => {
      let score = 50; // Base score
      
      if (notebook.content && notebook.content.length > 100) score += 20;
      if (notebook.description && notebook.description.length > 20) score += 15;
      if (notebook.content && notebook.content.includes('import')) score += 10;
      if (notebook.content && notebook.content.includes('def ') || notebook.content.includes('function')) score += 15;
      
      qualityScores.push(score);
    });

    const avgQuality = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
    
    if (avgQuality < 70) {
      checks.push({
        type: 'notebook_quality',
        status: 'warning',
        message: 'Notebook content could be more comprehensive',
        details: { average_score: Math.round(avgQuality) },
        score: Math.round(avgQuality)
      });
    } else {
      checks.push({
        type: 'notebook_quality',
        status: 'pass',
        message: 'Notebooks have good content quality',
        details: { average_score: Math.round(avgQuality) },
        score: Math.round(avgQuality)
      });
    }
  }

  return checks;
}

function checkIntegration(document, apiConfigs, notebooks) {
  const checks = [];
  const content = document.content || '';

  // Check if document references APIs
  const hasApiReferences = apiConfigs.some(config => 
    content.toLowerCase().includes(config.endpoint.toLowerCase()) ||
    content.toLowerCase().includes(config.name.toLowerCase())
  );

  if (apiConfigs.length > 0 && !hasApiReferences) {
    checks.push({
      type: 'api_integration',
      status: 'warning',
      message: 'Document should reference the configured API endpoints',
      details: { api_count: apiConfigs.length, references_found: false },
      score: 60
    });
  } else if (hasApiReferences) {
    checks.push({
      type: 'api_integration',
      status: 'pass',
      message: 'Document properly integrates with API configurations',
      details: { references_found: true },
      score: 100
    });
  }

  // Check consistency between sections
  const hasBothApiAndNotebooks = apiConfigs.length > 0 && notebooks.length > 0;
  if (hasBothApiAndNotebooks) {
    checks.push({
      type: 'content_consistency',
      status: 'pass',
      message: 'Complete documentation with APIs and use cases',
      details: { 
        has_documentation: content.length > 100,
        has_apis: apiConfigs.length > 0,
        has_notebooks: notebooks.length > 0
      },
      score: 100
    });
  }

  return checks;
}

function calculateOverallScore(checks) {
  if (checks.length === 0) return 0;
  
  const totalScore = checks.reduce((sum, check) => sum + (check.score || 0), 0);
  return Math.round(totalScore / checks.length);
}

module.exports = router;