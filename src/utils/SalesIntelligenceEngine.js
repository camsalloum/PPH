/**
 * SalesIntelligenceEngine - Executive Sales Intelligence Analyzer
 * 
 * Transforms raw sales data into actionable sales execution intelligence.
 * Uses ONLY sales-relevant metrics: Volume, Growth, Budget, Mix, Penetration, Concentration, Momentum, Retention
 * 
 * EXCLUDES: Profit, Margin, Cost, Production capacity, Machine efficiency
 * 
 * Language Style: Sales Director reviewing territory performance
 * Terminology:
 *   - "Revenue per MT" (not ASP)
 *   - "Volume-Revenue Mix Analysis" (not PVM)
 *   - "Revenue Intensity" (not Kilo Rate)
 *   - "Territory Performance" (not Financial Performance)
 * 
 * Analysis Pillars:
 *   1. Product Momentum - Accelerator/Builder/Stabilizer/At-Risk classification
 *   2. Customer Archetypes - Strategic segmentation for resource allocation
 *   3. Penetration Strength - Breadth of product adoption across customer base
 *   4. Growth Quality - Broad-based vs Concentrated vs Fragile growth patterns
 *   5. Budget Gap Ownership - Which products can realistically close the gap
 *   6. Churn Intelligence - Volume-weighted customer loss analysis
 *   7. Concentration Risk - Portfolio stability and dependency exposure
 *   8. Run Rate Reality - Mathematical feasibility of budget achievement
 */

// ====== PRODUCT MOMENTUM DIAGNOSIS ==========================================
/**
 * Classifies each product into momentum categories with sustainability analysis
 * 
 * Categories:
 * - ACCELERATOR: Strong growth & above plan - riding a wave
 * - BUILDER: Strong growth but still below budget - gaining traction
 * - STABILIZER: Low growth but stable contribution - reliable workhorse
 * - AT_RISK: Declining or structurally underperforming - needs intervention
 */
export const diagnoseProductMomentum = (product, portfolioTotals, allProducts) => {
  const {
    mtActual, mtBudget, mtPrevYear, mtYoY, mtVariance,
    amountActual, amountBudget, amountYoY, amountVariance,
    actualContribution, budgetShare
  } = product;

  // Calculate key indicators
  const hasGrowth = mtYoY !== null && mtYoY > 10;
  const hasStrongGrowth = mtYoY !== null && mtYoY > 25;
  const hasDeclining = mtYoY !== null && mtYoY < -10;
  const aboveBudget = mtVariance !== null && mtVariance > 0;
  const significantlyBelowBudget = mtVariance !== null && mtVariance < -15;
  const isMaterial = budgetShare >= 0.05 || actualContribution >= 0.05;

  // Determine momentum category
  let category, explanation, sustainability, riskFactors = [];

  if (hasStrongGrowth && aboveBudget) {
    category = 'ACCELERATOR';
    explanation = `Riding strong momentum with ${Math.abs(mtYoY).toFixed(1)}% YoY growth while exceeding budget by ${Math.abs(mtVariance).toFixed(1)}%`;
    
    // Assess sustainability
    const growthConcentration = analyzeGrowthConcentration(product, allProducts);
    if (growthConcentration.isConcentrated) {
      sustainability = 'FRAGILE';
      riskFactors.push(`Growth concentrated in ${growthConcentration.customerCount} customer(s) - momentum sensitive to account retention`);
    } else {
      sustainability = 'SUSTAINABLE';
    }
  } else if (hasGrowth && !aboveBudget) {
    category = 'BUILDER';
    explanation = `Gaining traction with ${Math.abs(mtYoY).toFixed(1)}% YoY growth but still tracking ${Math.abs(mtVariance).toFixed(1)}% below budget`;
    sustainability = 'BUILDING';
    
    // Calculate required acceleration
    const budgetGap = (mtBudget || 0) - (mtActual || 0);
    if (budgetGap > 0) {
      riskFactors.push(`Needs sustained acceleration to close remaining ${(budgetGap / 1000).toFixed(1)} MT gap`);
    }
  } else if (!hasGrowth && !hasDeclining && !significantlyBelowBudget) {
    category = 'STABILIZER';
    explanation = `Reliable performer with stable ${(actualContribution * 100).toFixed(1)}% portfolio contribution`;
    sustainability = 'STABLE';
    
    if (budgetShare > actualContribution * 1.2) {
      riskFactors.push('Underdelivering relative to strategic budget allocation');
    }
  } else {
    category = 'AT_RISK';
    
    if (hasDeclining && significantlyBelowBudget) {
      explanation = `Structural underperformance: ${Math.abs(mtYoY).toFixed(1)}% decline YoY compounded by ${Math.abs(mtVariance).toFixed(1)}% budget shortfall`;
      sustainability = 'CRITICAL';
      riskFactors.push('Dual pressure from market decline and execution gap');
    } else if (hasDeclining) {
      explanation = `Volume erosion of ${Math.abs(mtYoY).toFixed(1)}% YoY signals market or competitive pressure`;
      sustainability = 'DECLINING';
      riskFactors.push('Requires root cause analysis: market shift, competitive loss, or product lifecycle issue');
    } else {
      explanation = `Significant budget shortfall of ${Math.abs(mtVariance).toFixed(1)}% despite stable market conditions`;
      sustainability = 'EXECUTION_GAP';
      riskFactors.push('Execution issue rather than structural decline - recovery potential exists');
    }
  }

  return {
    category,
    categoryIcon: getCategoryIcon(category),
    categoryColor: getCategoryColor(category),
    explanation,
    sustainability,
    sustainabilityLabel: getSustainabilityLabel(sustainability),
    riskFactors,
    isMaterial,
    salesInsight: generateProductSalesInsight(category, product, sustainability, riskFactors)
  };
};

const getCategoryIcon = (category) => ({
  'ACCELERATOR': '🚀',
  'BUILDER': '📈',
  'STABILIZER': '⚖️',
  'AT_RISK': '⚠️'
}[category] || '📊');

const getCategoryColor = (category) => ({
  'ACCELERATOR': '#059669',
  'BUILDER': '#3b82f6',
  'STABILIZER': '#6b7280',
  'AT_RISK': '#dc2626'
}[category] || '#374151');

const getSustainabilityLabel = (sustainability) => ({
  'SUSTAINABLE': 'Sustainable momentum',
  'FRAGILE': 'Fragile - customer dependent',
  'BUILDING': 'Building momentum',
  'STABLE': 'Stable contributor',
  'CRITICAL': 'Critical attention needed',
  'DECLINING': 'Declining trajectory',
  'EXECUTION_GAP': 'Execution gap - recoverable'
}[sustainability] || sustainability);

const analyzeGrowthConcentration = (product, allProducts) => {
  // This would ideally cross-reference with customer-product data
  // For now, return a placeholder that can be enhanced with customer linkage
  return {
    isConcentrated: false,
    customerCount: 0,
    topCustomerShare: 0
  };
};

const generateProductSalesInsight = (category, product, sustainability, riskFactors) => {
  const { name, mtYoY, mtVariance, actualContribution, budgetShare } = product;
  
  switch (category) {
    case 'ACCELERATOR':
      return sustainability === 'FRAGILE'
        ? `${name} is an Accelerator driven by explosive YoY growth, but performance is concentrated - making momentum sensitive to account retention.`
        : `${name} is a clear Accelerator with broad-based growth and budget outperformance - maintain current trajectory.`;
    
    case 'BUILDER':
      return `${name} shows Builder characteristics with strong growth momentum but hasn't yet closed the budget gap - focus on converting pipeline to accelerate.`;
    
    case 'STABILIZER':
      return `${name} is a Stabilizer providing reliable ${(actualContribution * 100).toFixed(1)}% portfolio contribution - protect base while seeking incremental growth.`;
    
    case 'AT_RISK':
      return sustainability === 'EXECUTION_GAP'
        ? `${name} is At-Risk due to execution rather than structural issues - recovery potential exists with focused intervention.`
        : `${name} requires strategic review - the ${Math.abs(mtYoY || 0).toFixed(1)}% decline appears ${sustainability === 'CRITICAL' ? 'structural' : 'market-driven'} rather than sales-execution related.`;
    
    default:
      return `${name} requires further analysis to determine momentum trajectory.`;
  }
};

// ====== BUDGET GAP REALISM ANALYSIS =========================================
/**
 * Analyzes whether remaining budget gap is mathematically achievable
 * based on current velocity and product capabilities
 */
export const analyzeBudgetGapRealism = (products, portfolioTotals, monthsRemaining) => {
  const { totalMTBudget, totalMTActual, totalMTYTDCurrent } = portfolioTotals;
  
  const remainingGap = Math.max(0, (totalMTBudget || 0) - (totalMTYTDCurrent || totalMTActual || 0));
  const remainingGapMT = remainingGap / 1000;
  
  if (remainingGap <= 0) {
    return {
      status: 'ON_TRACK',
      insight: 'Portfolio is on track or ahead of FY budget target.',
      gapMT: 0,
      feasibility: 'ACHIEVED',
      contributors: [],
      saturatedProducts: []
    };
  }

  if (!monthsRemaining || monthsRemaining <= 0) {
    return {
      status: 'END_OF_YEAR',
      insight: `FY has concluded with ${remainingGapMT.toFixed(0)} MT shortfall.`,
      gapMT: remainingGapMT,
      feasibility: 'CONCLUDED',
      contributors: [],
      saturatedProducts: []
    };
  }

  const requiredMonthlyRun = remainingGap / monthsRemaining;
  const requiredMonthlyRunMT = requiredMonthlyRun / 1000;

  // Analyze each product's capability to contribute to gap closure
  const productCapabilities = products
    .filter(p => p.mtBudget > 0 || p.mtFYBudget > 0)
    .map(p => {
      const productBudget = p.mtFYBudget || p.mtBudget || 0;
      const productActual = p.mtYTDCurrent || p.mtActual || 0;
      const productGap = Math.max(0, productBudget - productActual);
      const productGapMT = productGap / 1000;
      
      // Calculate current velocity (simplified - would ideally use historical monthly data)
      const monthsElapsed = 12 - monthsRemaining;
      const currentMonthlyVelocity = monthsElapsed > 0 ? productActual / monthsElapsed : productActual;
      const currentMonthlyVelocityMT = currentMonthlyVelocity / 1000;
      
      // Calculate required acceleration
      const requiredMonthlyToClose = monthsRemaining > 0 ? productGap / monthsRemaining : productGap;
      const accelerationRequired = currentMonthlyVelocity > 0 
        ? ((requiredMonthlyToClose - currentMonthlyVelocity) / currentMonthlyVelocity) * 100 
        : null;
      
      // Determine if product can realistically contribute
      const hasMomentum = p.mtYoY !== null && p.mtYoY > 0;
      const hasCapacity = p.mtVariance !== null && p.mtVariance < 20; // Not already maxed out
      const canContribute = productGap > 0 && (accelerationRequired === null || accelerationRequired < 50);
      const isSaturated = p.mtVariance !== null && p.mtVariance > 15; // Already exceeding budget significantly
      
      return {
        name: p.name,
        productGapMT,
        currentMonthlyVelocityMT,
        requiredMonthlyMT: requiredMonthlyToClose / 1000,
        accelerationRequired,
        canContribute,
        isSaturated,
        hasMomentum,
        potentialContribution: canContribute ? Math.min(productGapMT, remainingGapMT * 0.5) : 0,
        contributionInsight: generateContributionInsight(p, productGapMT, accelerationRequired, canContribute, isSaturated)
      };
    })
    .sort((a, b) => b.potentialContribution - a.potentialContribution);

  const contributors = productCapabilities.filter(p => p.canContribute);
  const saturatedProducts = productCapabilities.filter(p => p.isSaturated);
  const totalPotential = contributors.reduce((sum, p) => sum + p.potentialContribution, 0);
  const coveragePercent = remainingGapMT > 0 ? (totalPotential / remainingGapMT) * 100 : 100;

  // Determine overall feasibility
  let feasibility, status;
  if (coveragePercent >= 80) {
    feasibility = 'REALISTIC';
    status = 'ACHIEVABLE';
  } else if (coveragePercent >= 50) {
    feasibility = 'CHALLENGING';
    status = 'STRETCH';
  } else {
    feasibility = 'OPTIMISTIC';
    status = 'AT_RISK';
  }

  const insight = generateBudgetGapInsight(remainingGapMT, monthsRemaining, contributors, coveragePercent, requiredMonthlyRunMT);

  return {
    status,
    gapMT: remainingGapMT,
    monthsRemaining,
    requiredMonthlyMT: requiredMonthlyRunMT,
    feasibility,
    coveragePercent,
    insight,
    contributors: contributors.slice(0, 5),
    saturatedProducts: saturatedProducts.slice(0, 3)
  };
};

const generateContributionInsight = (product, gapMT, accelerationRequired, canContribute, isSaturated) => {
  if (isSaturated) {
    return `Already exceeding budget - unlikely to contribute additional volume`;
  }
  if (!canContribute && accelerationRequired !== null && accelerationRequired > 50) {
    return `Would require ${accelerationRequired.toFixed(0)}% acceleration - unrealistic without market shift`;
  }
  if (canContribute && accelerationRequired !== null && accelerationRequired < 20) {
    return `Current velocity can close gap with modest ${accelerationRequired.toFixed(0)}% acceleration`;
  }
  if (canContribute) {
    return `Has velocity to contribute ${gapMT.toFixed(1)} MT with focused execution`;
  }
  return `Limited contribution potential at current trajectory`;
};

const generateBudgetGapInsight = (gapMT, monthsRemaining, contributors, coveragePercent, requiredMonthlyMT) => {
  const contributorCount = contributors.length;
  
  if (coveragePercent >= 80) {
    return `Based on current momentum, ${contributorCount} product${contributorCount !== 1 ? 's have' : ' has'} the velocity required to close the ${gapMT.toFixed(0)} MT gap. Requires ${requiredMonthlyMT.toFixed(1)} MT/month average.`;
  } else if (coveragePercent >= 50) {
    return `Only ${contributorCount} product${contributorCount !== 1 ? 's are' : ' is'} capable of materially contributing to the ${gapMT.toFixed(0)} MT gap. Current trajectory covers ~${coveragePercent.toFixed(0)}% - gap closure requires new customer activation or market expansion.`;
  } else {
    return `At current run-rate, closing the ${gapMT.toFixed(0)} MT gap is optimistic. Would require ${requiredMonthlyMT.toFixed(1)} MT/month - a significant acceleration from current trajectory without new business wins.`;
  }
};

// ====== CUSTOMER GROWTH ARCHETYPES ==========================================
/**
 * Segments customers into strategic archetypes for sales prioritization
 * 
 * Archetypes:
 * - CORE_GROWTH: High volume + growing - protect and expand
 * - MOMENTUM: Small but fast growth - invest for future scale
 * - DRIFTING: Early decline signals - intervention needed
 * - LOST_RISK: Structural volume drop - retention emergency
 * - STABLE: Consistent performance - maintain relationship
 * - NEW: Recently acquired - onboarding and expansion opportunity
 */
export const classifyCustomerArchetype = (customer, portfolioTotals, hasPreviousYearData) => {
  const { 
    actual, budget, prev, share, yoy, vsBudget,
    name
  } = customer;

  // Calculate thresholds relative to portfolio
  const isHighVolume = share >= 0.05; // Top 20 customers typically
  const isMediumVolume = share >= 0.02;
  const isGrowing = yoy !== null && yoy > 15;
  const isStrongGrowth = yoy !== null && yoy > 30;
  const isDeclining = yoy !== null && yoy < -15;
  const isSevereDecline = yoy !== null && yoy < -30;
  const aboveBudget = vsBudget !== null && vsBudget > 0;
  const significantlyBelowBudget = vsBudget !== null && vsBudget < -20;
  const isNew = prev === 0 && actual > 0;

  let archetype, explanation, priority, actionRequired;

  if (isNew) {
    archetype = 'NEW';
    explanation = 'Recently acquired customer - onboarding and expansion opportunity';
    priority = 'MEDIUM';
    actionRequired = 'Focus on successful onboarding, identify cross-sell opportunities, understand full potential';
  } else if (isHighVolume && isGrowing) {
    archetype = 'CORE_GROWTH';
    explanation = `Strategic account with ${share.toFixed(1)}% portfolio share and ${Math.abs(yoy).toFixed(1)}% growth`;
    priority = 'HIGH';
    actionRequired = 'Protect relationship, deepen engagement, explore expansion opportunities';
  } else if (!isHighVolume && isStrongGrowth) {
    archetype = 'MOMENTUM';
    explanation = `Emerging opportunity with ${Math.abs(yoy).toFixed(1)}% growth trajectory`;
    priority = 'HIGH';
    actionRequired = 'Invest in relationship, accelerate growth, potentially upgrade to key account';
  } else if (isMediumVolume && isDeclining && !isSevereDecline) {
    archetype = 'DRIFTING';
    explanation = `Early warning: ${Math.abs(yoy).toFixed(1)}% decline signals potential disengagement`;
    priority = 'URGENT';
    actionRequired = 'Immediate outreach required - understand root cause before further erosion';
  } else if (isSevereDecline || (isDeclining && isHighVolume)) {
    archetype = 'LOST_RISK';
    explanation = `Critical: ${Math.abs(yoy).toFixed(1)}% volume drop indicates structural issue`;
    priority = 'CRITICAL';
    actionRequired = 'Retention emergency - executive engagement, competitive analysis, recovery plan';
  } else if (!isDeclining && !isGrowing && isMediumVolume) {
    archetype = 'STABLE';
    explanation = `Consistent performer with ${share.toFixed(1)}% share`;
    priority = 'MAINTAIN';
    actionRequired = 'Maintain relationship, seek incremental growth opportunities';
  } else {
    archetype = 'DEVELOPING';
    explanation = 'Developing account requiring continued cultivation';
    priority = 'NORMAL';
    actionRequired = 'Standard account management with growth focus';
  }

  return {
    archetype,
    archetypeIcon: getArchetypeIcon(archetype),
    archetypeColor: getArchetypeColor(archetype),
    explanation,
    priority,
    priorityOrder: getPriorityOrder(priority),
    actionRequired,
    salesInsight: generateCustomerSalesInsight(archetype, customer, explanation)
  };
};

const getArchetypeIcon = (archetype) => ({
  'CORE_GROWTH': '⭐',
  'MOMENTUM': '🚀',
  'DRIFTING': '📉',
  'LOST_RISK': '🔴',
  'STABLE': '✓',
  'NEW': '🆕',
  'DEVELOPING': '📊'
}[archetype] || '📊');

const getArchetypeColor = (archetype) => ({
  'CORE_GROWTH': '#059669',
  'MOMENTUM': '#3b82f6',
  'DRIFTING': '#f59e0b',
  'LOST_RISK': '#dc2626',
  'STABLE': '#6b7280',
  'NEW': '#8b5cf6',
  'DEVELOPING': '#6b7280'
}[archetype] || '#374151');

const getPriorityOrder = (priority) => ({
  'CRITICAL': 1,
  'URGENT': 2,
  'HIGH': 3,
  'MEDIUM': 4,
  'MAINTAIN': 5,
  'NORMAL': 6
}[priority] || 99);

const generateCustomerSalesInsight = (archetype, customer, explanation) => {
  const { name, share, yoy } = customer;
  const formattedName = name || 'Customer';
  
  switch (archetype) {
    case 'CORE_GROWTH':
      return `${formattedName} represents a Core Growth account commanding ${(share * 100).toFixed(1)}% of portfolio with strong momentum - prioritize relationship deepening.`;
    
    case 'MOMENTUM':
      return `${formattedName} shows Momentum account characteristics with rapid growth - invest now to capture future scale potential.`;
    
    case 'DRIFTING':
      return `${formattedName} is Drifting with early decline signals - immediate intervention can prevent further erosion.`;
    
    case 'LOST_RISK':
      return `${formattedName} is at Lost Risk status with structural volume drop - requires executive-level retention engagement.`;
    
    case 'NEW':
      return `${formattedName} is a New acquisition - focus on successful onboarding and identifying full account potential.`;
    
    case 'STABLE':
      return `${formattedName} is a Stable contributor providing consistent volume - maintain relationship while seeking incremental growth.`;
    
    default:
      return `${formattedName} is in development phase - continue cultivation with standard account management.`;
  }
};

// ====== CHURN RISK INTELLIGENCE =============================================
/**
 * Analyzes churn beyond simple percentage to understand severity and patterns
 */
export const analyzeChurnIntelligence = (retentionAnalysis, focusCustomers, portfolioTotals) => {
  const {
    churnRate, lostCustomers, lostCustomerNames,
    retentionRate, newCustomers, newCustomerNames,
    decliningCustomers, decliningCustomerNames
  } = retentionAnalysis;

  const { totalActual, totalPrev } = portfolioTotals;

  // Analyze severity of lost customers
  let churnSeverity = 'LOW';
  let churnType = 'RANDOM';
  let churnInsight = '';
  
  if (churnRate >= 0.3) {
    churnSeverity = 'CRITICAL';
  } else if (churnRate >= 0.2) {
    churnSeverity = 'HIGH';
  } else if (churnRate >= 0.1) {
    churnSeverity = 'MODERATE';
  }

  // Determine if churn is concentrated or distributed
  // This would ideally cross-reference with product group data
  const lostCount = lostCustomers || 0;
  const newCount = newCustomers || 0;
  const netChange = newCount - lostCount;

  // Calculate volume impact (simplified - would need lost customer volume data)
  const volumeRetention = totalPrev > 0 ? (totalActual / totalPrev) : 1;
  const impliedLostVolume = totalPrev > 0 ? Math.max(0, totalPrev - totalActual) : 0;

  // Generate intelligence
  if (churnSeverity === 'CRITICAL') {
    churnInsight = `Critical churn rate of ${(churnRate * 100).toFixed(1)}% signals systemic issue requiring immediate attention. Lost ${lostCount} customers - analyze for common patterns.`;
    churnType = 'SYSTEMIC';
  } else if (lostCount > newCount * 1.5) {
    churnInsight = `Net customer loss (${lostCount} lost vs ${newCount} gained) indicates acquisition not keeping pace with attrition.`;
    churnType = 'ATTRITION';
  } else if (decliningCustomers > focusCustomers?.length * 0.3) {
    churnInsight = `${decliningCustomers} customers showing significant decline - early warning for potential future churn.`;
    churnType = 'EARLY_WARNING';
  } else if (churnRate > 0 && churnRate < 0.1) {
    churnInsight = `Healthy churn rate of ${(churnRate * 100).toFixed(1)}% - natural portfolio turnover with ${newCount} new customers offsetting losses.`;
    churnType = 'HEALTHY';
  } else {
    churnInsight = `Churn appears randomly distributed across customer base rather than concentrated in specific segments.`;
    churnType = 'RANDOM';
  }

  // Retention health assessment
  const retentionHealth = retentionRate >= 0.9 ? 'EXCELLENT' :
                         retentionRate >= 0.8 ? 'GOOD' :
                         retentionRate >= 0.7 ? 'FAIR' : 'POOR';

  // Strategic recommendations
  const recommendations = [];
  
  if (churnSeverity !== 'LOW') {
    recommendations.push('Conduct exit analysis with lost customers to identify root causes');
  }
  if (decliningCustomers > 0) {
    recommendations.push(`Prioritize outreach to ${decliningCustomers} declining customers before they churn`);
  }
  if (netChange < 0) {
    recommendations.push('Increase acquisition focus to offset customer attrition');
  }
  if (churnType === 'SYSTEMIC') {
    recommendations.push('Review competitive positioning and service delivery across the board');
  }

  return {
    churnSeverity,
    churnSeverityColor: getSeverityColor(churnSeverity),
    churnType,
    churnInsight,
    retentionHealth,
    netCustomerChange: netChange,
    volumeRetentionPct: volumeRetention * 100,
    atRiskCount: decliningCustomers,
    atRiskNames: decliningCustomerNames || [],
    recommendations,
    executiveSummary: generateChurnExecutiveSummary(churnSeverity, churnType, retentionRate, netChange)
  };
};

const getSeverityColor = (severity) => ({
  'CRITICAL': '#dc2626',
  'HIGH': '#ea580c',
  'MODERATE': '#f59e0b',
  'LOW': '#059669'
}[severity] || '#6b7280');

const generateChurnExecutiveSummary = (severity, type, retentionRate, netChange) => {
  const retentionPct = (retentionRate * 100).toFixed(1);
  
  if (severity === 'LOW' && netChange >= 0) {
    return `Customer retention is healthy at ${retentionPct}% with positive net customer growth. Focus on maintaining service quality.`;
  } else if (severity === 'MODERATE') {
    return `Customer retention at ${retentionPct}% requires monitoring. ${type === 'EARLY_WARNING' ? 'Several customers showing decline signals - proactive outreach recommended.' : 'Routine churn - ensure acquisition pipeline remains strong.'}`;
  } else if (severity === 'HIGH' || severity === 'CRITICAL') {
    return `Customer retention at ${retentionPct}% is concerning. ${type === 'SYSTEMIC' ? 'Pattern suggests systemic issue requiring root cause analysis.' : 'Prioritize retention initiatives and lost customer analysis.'}`;
  }
  return `Customer retention stands at ${retentionPct}%. Net customer change: ${netChange >= 0 ? '+' : ''}${netChange}.`;
};

// ====== CONCENTRATION RISK INTERPRETATION ===================================
/**
 * Goes beyond percentages to interpret stability, dependency, and growth vulnerability
 */
export const interpretConcentrationRisk = (concentrationRisk, portfolioTotals, hasPreviousYearData) => {
  const {
    level, top1Share, top3Share, top5Share,
    customerCount, avgVolumePerCustomer, trend
  } = concentrationRisk;

  const insights = [];
  let stabilityRisk = 'LOW';
  let dependencyExposure = 'LOW';
  let growthVulnerability = 'LOW';

  // Stability risk analysis
  if (top1Share > 0.4) {
    stabilityRisk = 'CRITICAL';
    insights.push(`Single customer dependency (${(top1Share * 100).toFixed(1)}% share) creates significant quarterly volatility risk`);
  } else if (top1Share > 0.25) {
    stabilityRisk = 'HIGH';
    insights.push(`Top customer concentration at ${(top1Share * 100).toFixed(1)}% increases forecast sensitivity`);
  } else if (top3Share > 0.6) {
    stabilityRisk = 'MODERATE';
    insights.push(`Top 3 customers control ${(top3Share * 100).toFixed(1)}% - manageable but monitor closely`);
  }

  // Dependency exposure analysis
  if (top3Share > 0.7) {
    dependencyExposure = 'HIGH';
    insights.push(`High dependency on top 3 customers weakens negotiating position and pricing power`);
  } else if (top5Share > 0.8) {
    dependencyExposure = 'MODERATE';
    insights.push(`Portfolio relies on top 5 for ${(top5Share * 100).toFixed(1)}% of volume - diversification opportunity exists`);
  }

  // Growth vulnerability analysis
  if (trend?.direction === 'INCREASING') {
    growthVulnerability = 'INCREASING';
    insights.push(`Concentration trend ${trend.directionIcon} increasing - growth coming from existing large accounts`);
  } else if (customerCount < 10) {
    growthVulnerability = 'HIGH';
    insights.push(`Limited customer base (${customerCount}) constrains growth ceiling without new acquisition`);
  }

  // Strategic interpretation
  let strategicInterpretation = '';
  if (level === 'CRITICAL') {
    strategicInterpretation = `Critical concentration creates existential dependency - any disruption with top accounts would severely impact performance. Diversification is strategically imperative.`;
  } else if (level === 'HIGH') {
    strategicInterpretation = `High concentration is typical for B2B but exposes portfolio to customer-specific risks. Balance account development with new customer acquisition.`;
  } else if (level === 'MEDIUM') {
    strategicInterpretation = `Balanced concentration allows for focused account management while maintaining portfolio resilience. Continue current strategy.`;
  } else {
    strategicInterpretation = `Well-diversified customer base provides stability and negotiating flexibility. Opportunity to deepen relationships with high-potential accounts.`;
  }

  return {
    level,
    stabilityRisk,
    stabilityRiskColor: getRiskColor(stabilityRisk),
    dependencyExposure,
    dependencyColor: getRiskColor(dependencyExposure),
    growthVulnerability,
    growthColor: getRiskColor(growthVulnerability),
    insights,
    strategicInterpretation,
    trend,
    recommendation: generateConcentrationRecommendation(level, stabilityRisk, customerCount)
  };
};

const getRiskColor = (risk) => ({
  'CRITICAL': '#dc2626',
  'HIGH': '#ea580c',
  'MODERATE': '#f59e0b',
  'INCREASING': '#f59e0b',
  'LOW': '#059669'
}[risk] || '#6b7280');

const generateConcentrationRecommendation = (level, stabilityRisk, customerCount) => {
  if (level === 'CRITICAL') {
    return 'URGENT: Develop 3-5 new significant accounts within next 6 months to reduce single-customer dependency';
  } else if (level === 'HIGH' && customerCount < 15) {
    return 'PRIORITY: Expand customer acquisition efforts while maintaining top account relationships';
  } else if (stabilityRisk === 'HIGH') {
    return 'FOCUS: Strengthen relationships with tier-2 customers to build natural diversification';
  }
  return 'MAINTAIN: Continue balanced approach between account development and new acquisition';
};

// ====== RUN-RATE REALITY ANALYSIS ==========================================
/**
 * Evaluates whether budget gap is achievable based on run-rate and historical patterns
 */
export const analyzeRunRateReality = (runRateInfo, monthsRemaining, portfolioTotals) => {
  const { 
    totalMTActual, totalMTBudget, totalMTYTDCurrent,
    totalMTFYBudget
  } = portfolioTotals;

  const fyBudget = totalMTFYBudget || totalMTBudget || 0;
  const ytdActual = totalMTYTDCurrent || totalMTActual || 0;
  const remainingBudget = Math.max(0, fyBudget - ytdActual);
  const remainingBudgetMT = remainingBudget / 1000;

  if (!monthsRemaining || monthsRemaining <= 0) {
    return {
      status: 'YEAR_END',
      insight: 'Fiscal year concluded - final performance locked in.',
      requiredAcceleration: null,
      feasibility: 'N/A'
    };
  }

  // Calculate required monthly run rate
  const monthsElapsed = 12 - monthsRemaining;
  const avgMonthlyActual = monthsElapsed > 0 ? ytdActual / monthsElapsed : ytdActual;
  const avgMonthlyActualMT = avgMonthlyActual / 1000;
  
  const requiredMonthly = remainingBudget / monthsRemaining;
  const requiredMonthlyMT = requiredMonthly / 1000;
  
  // Calculate required acceleration
  const accelerationRequired = avgMonthlyActual > 0 
    ? ((requiredMonthly - avgMonthlyActual) / avgMonthlyActual) * 100 
    : null;

  // Determine feasibility
  let feasibility, status, insight;
  
  if (remainingBudget <= 0) {
    feasibility = 'ACHIEVED';
    status = 'ON_TRACK';
    insight = 'FY budget target already achieved - maintain momentum for stretch goals.';
  } else if (accelerationRequired !== null && accelerationRequired <= 0) {
    feasibility = 'ON_PACE';
    status = 'GREEN';
    insight = `Current run rate of ${avgMonthlyActualMT.toFixed(1)} MT/month exceeds required ${requiredMonthlyMT.toFixed(1)} MT/month - on track for budget.`;
  } else if (accelerationRequired !== null && accelerationRequired <= 15) {
    feasibility = 'ACHIEVABLE';
    status = 'YELLOW';
    insight = `Requires ${accelerationRequired.toFixed(0)}% acceleration from current ${avgMonthlyActualMT.toFixed(1)} MT/month to ${requiredMonthlyMT.toFixed(1)} MT/month - achievable with focused execution.`;
  } else if (accelerationRequired !== null && accelerationRequired <= 30) {
    feasibility = 'CHALLENGING';
    status = 'ORANGE';
    insight = `At current ${avgMonthlyActualMT.toFixed(1)} MT/month, closing the gap requires ${accelerationRequired.toFixed(0)}% acceleration to ${requiredMonthlyMT.toFixed(1)} MT/month - aggressive without new customer activation.`;
  } else {
    feasibility = 'UNLIKELY';
    status = 'RED';
    insight = `Current trajectory of ${avgMonthlyActualMT.toFixed(1)} MT/month would need ${accelerationRequired?.toFixed(0) || '50+'}% acceleration - unrealistic without significant market shift or major wins.`;
  }

  return {
    status,
    feasibility,
    insight,
    currentMonthlyMT: avgMonthlyActualMT,
    requiredMonthlyMT,
    remainingGapMT: remainingBudgetMT,
    monthsRemaining,
    accelerationRequired,
    statusColor: getStatusColor(status)
  };
};

const getStatusColor = (status) => ({
  'GREEN': '#059669',
  'YELLOW': '#eab308',
  'ORANGE': '#f97316',
  'RED': '#dc2626',
  'ON_TRACK': '#059669'
}[status] || '#6b7280');

// ====== VOLUME VS REVENUE DIRECTION (SALES VIEW) ============================
/**
 * Analyzes volume vs revenue trends WITHOUT profit/margin conclusions
 * Focuses on mix shift and pricing pressure signals
 */
export const analyzeVolumeRevenueDirection = (volumeMetrics, salesMetrics) => {
  const { mtYoY, mtVsBudget } = volumeMetrics;
  const { amtYoY, amtVsBudget } = salesMetrics;

  const insights = [];
  let direction = 'ALIGNED';
  let signalType = null;

  // Compare volume vs revenue growth rates
  if (mtYoY !== null && amtYoY !== null) {
    const volumeGrowthFaster = mtYoY > amtYoY + 5;
    const revenueGrowthFaster = amtYoY > mtYoY + 5;
    
    if (volumeGrowthFaster) {
      direction = 'VOLUME_LEADING';
      signalType = 'MIX_DILUTION';
      insights.push(`Volume growing ${(mtYoY - amtYoY).toFixed(1)}pp faster than revenue - indicates product mix shift toward lower-price items or pricing pressure`);
    } else if (revenueGrowthFaster) {
      direction = 'REVENUE_LEADING';
      signalType = 'MIX_ENRICHMENT';
      insights.push(`Revenue growing ${(amtYoY - mtYoY).toFixed(1)}pp faster than volume - indicates favorable mix shift toward premium products`);
    } else {
      insights.push(`Volume and revenue moving in alignment - stable product mix and pricing`);
    }
  }

  // Compare budget variances
  if (mtVsBudget !== null && amtVsBudget !== null) {
    const volumeBetterThanRevenue = mtVsBudget > amtVsBudget + 5;
    const revenueBetterThanVolume = amtVsBudget > mtVsBudget + 5;
    
    if (volumeBetterThanRevenue) {
      insights.push(`Volume outperforming revenue vs budget by ${(mtVsBudget - amtVsBudget).toFixed(1)}pp - review pricing execution or mix assumptions`);
    } else if (revenueBetterThanVolume) {
      insights.push(`Revenue outperforming volume vs budget by ${(amtVsBudget - mtVsBudget).toFixed(1)}pp - favorable price realization or mix`);
    }
  }

  // Strategic interpretation (sales-focused, NOT profit-focused)
  let salesImplication = '';
  if (signalType === 'MIX_DILUTION') {
    salesImplication = 'If intentional for market share, ensure volume gains justify price positioning. If unintentional, review sales incentive alignment.';
  } else if (signalType === 'MIX_ENRICHMENT') {
    salesImplication = 'Favorable trend - validate sustainability and whether volume growth opportunities exist in current premium segments.';
  }

  return {
    direction,
    signalType,
    insights,
    salesImplication,
    volumeYoY: mtYoY,
    revenueYoY: amtYoY,
    volumeVsBudget: mtVsBudget,
    revenueVsBudget: amtVsBudget
  };
};

// ====== PENETRATION STRENGTH INDEX ==========================================
/**
 * Measures breadth of product adoption across customer base
 * Critical for understanding if growth is from deepening (existing buyers) vs expanding (new buyers)
 * 
 * Penetration Index = (Customers buying product / Total active customers) × 100
 * 
 * Classification:
 * - UNIVERSAL: >80% penetration - staple product in portfolio
 * - STRONG: 50-80% - well-established, room for expansion
 * - MODERATE: 25-50% - targeted product, growth opportunity
 * - NICHE: <25% - specialist or new product, assess potential
 */
export const analyzePenetrationStrength = (product, allProducts, customerProductData, totalActiveCustomers) => {
  const { name, mtActual, mtBudget, actualContribution } = product;
  
  // Calculate customers buying this product
  const customersWithProduct = customerProductData?.filter(cp => 
    cp.productName === name && (cp.mtActual > 0 || cp.actual > 0)
  ) || [];
  const customerCount = customersWithProduct.length;
  
  // Calculate penetration percentage
  const penetrationRate = totalActiveCustomers > 0 
    ? (customerCount / totalActiveCustomers) * 100 
    : 0;
  
  // Determine penetration class
  let penetrationClass, penetrationInsight, growthLever;
  
  if (penetrationRate >= 80) {
    penetrationClass = 'UNIVERSAL';
    penetrationInsight = `${name} is a staple product reaching ${penetrationRate.toFixed(0)}% of customers - growth comes from volume per customer`;
    growthLever = 'WALLET_SHARE';
  } else if (penetrationRate >= 50) {
    penetrationClass = 'STRONG';
    penetrationInsight = `${name} has strong ${penetrationRate.toFixed(0)}% penetration with room to expand to remaining ${(100 - penetrationRate).toFixed(0)}% of base`;
    growthLever = 'CUSTOMER_EXPANSION';
  } else if (penetrationRate >= 25) {
    penetrationClass = 'MODERATE';
    penetrationInsight = `${name} at ${penetrationRate.toFixed(0)}% penetration represents expansion opportunity across ${(100 - penetrationRate).toFixed(0)}% of untapped customers`;
    growthLever = 'CROSS_SELL';
  } else {
    penetrationClass = 'NICHE';
    penetrationInsight = `${name} reaching only ${penetrationRate.toFixed(0)}% of customers - evaluate if specialist product or underdeveloped opportunity`;
    growthLever = penetrationRate < 10 ? 'PRODUCT_FIT' : 'SALES_FOCUS';
  }
  
  // Calculate revenue per MT (Sales Director language for ASP)
  const revenuePerMT = mtActual > 0 && product.amountActual 
    ? product.amountActual / mtActual 
    : null;
  
  // Avg volume per buying customer
  const avgVolumePerCustomer = customerCount > 0 
    ? mtActual / customerCount 
    : 0;
  
  return {
    penetrationClass,
    penetrationClassColor: getPenetrationColor(penetrationClass),
    penetrationRate,
    customerCount,
    totalCustomers: totalActiveCustomers,
    penetrationInsight,
    growthLever,
    growthLeverLabel: getGrowthLeverLabel(growthLever),
    revenuePerMT,
    avgVolumePerCustomer,
    salesDirectorTakeaway: generatePenetrationDirectorTakeaway(penetrationClass, name, penetrationRate, avgVolumePerCustomer)
  };
};

const getPenetrationColor = (cls) => ({
  'UNIVERSAL': '#059669',
  'STRONG': '#3b82f6',
  'MODERATE': '#f59e0b',
  'NICHE': '#6b7280'
}[cls] || '#6b7280');

const getGrowthLeverLabel = (lever) => ({
  'WALLET_SHARE': 'Increase volume per customer',
  'CUSTOMER_EXPANSION': 'Expand to non-buying customers',
  'CROSS_SELL': 'Cross-sell opportunity',
  'SALES_FOCUS': 'Increase sales focus',
  'PRODUCT_FIT': 'Evaluate product-market fit'
}[lever] || lever);

const generatePenetrationDirectorTakeaway = (cls, name, rate, avgVolume) => {
  switch (cls) {
    case 'UNIVERSAL':
      return `${name} is your territory staple at ${rate.toFixed(0)}% penetration. Focus on increasing volume per customer rather than new customer acquisition for this product.`;
    case 'STRONG':
      return `${name} has solid adoption. Identify the ${(100 - rate).toFixed(0)}% non-buyers and evaluate fit - likely low-hanging fruit for expansion.`;
    case 'MODERATE':
      return `${name} at ${rate.toFixed(0)}% represents a cross-sell opportunity. Analyze buying vs non-buying customers to identify conversion patterns.`;
    case 'NICHE':
      return `${name} reaches only ${rate.toFixed(0)}% of customers. Before investing in expansion, validate whether limited penetration is by design (specialist) or execution gap.`;
    default:
      return `Review ${name} penetration strategy.`;
  }
};

// ====== GROWTH QUALITY ANALYSIS =============================================
/**
 * Determines if growth is healthy (broad-based) or fragile (concentrated)
 * 
 * Classifications:
 * - BROAD_BASED: Growth distributed across many customers - sustainable
 * - CONCENTRATED: Growth from top 3 customers - risky
 * - FRAGILE: Growth from single customer - very risky
 * - DECLINING_BROAD: Decline across base - market/competitive issue
 * - DECLINING_CONCENTRATED: Decline from specific accounts - retention issue
 */
export const analyzeGrowthQuality = (product, customerProductData, portfolioTotals) => {
  const { name, mtActual, mtPrevYear, mtYoY } = product;
  
  const isGrowing = mtYoY !== null && mtYoY > 0;
  const isDeclining = mtYoY !== null && mtYoY < 0;
  const growthVolume = mtActual - (mtPrevYear || 0);
  
  // Get customer-level data for this product
  const productCustomers = customerProductData?.filter(cp => 
    cp.productName === name
  ) || [];
  
  // Calculate growth contribution by customer
  const customerGrowthContributions = productCustomers
    .map(cp => ({
      customer: cp.customerName,
      currentVolume: cp.mtActual || cp.actual || 0,
      previousVolume: cp.mtPrev || cp.prev || 0,
      growthContribution: (cp.mtActual || cp.actual || 0) - (cp.mtPrev || cp.prev || 0)
    }))
    .filter(c => c.growthContribution !== 0)
    .sort((a, b) => Math.abs(b.growthContribution) - Math.abs(a.growthContribution));
  
  // Calculate concentration of growth
  const totalGrowthAbs = customerGrowthContributions.reduce((sum, c) => sum + Math.abs(c.growthContribution), 0);
  const top1GrowthShare = customerGrowthContributions[0] && totalGrowthAbs > 0
    ? Math.abs(customerGrowthContributions[0].growthContribution) / totalGrowthAbs
    : 0;
  const top3GrowthShare = totalGrowthAbs > 0
    ? customerGrowthContributions.slice(0, 3).reduce((sum, c) => sum + Math.abs(c.growthContribution), 0) / totalGrowthAbs
    : 0;
  
  // Determine growth quality
  let quality, insight, riskLevel, recommendation;
  
  if (isGrowing) {
    if (top1GrowthShare > 0.6) {
      quality = 'FRAGILE';
      riskLevel = 'HIGH';
      insight = `${(top1GrowthShare * 100).toFixed(0)}% of growth from single customer (${customerGrowthContributions[0]?.customer || 'Top 1'}) - highly fragile`;
      recommendation = 'Diversify growth sources urgently - single-customer dependency creates volatility risk';
    } else if (top3GrowthShare > 0.8) {
      quality = 'CONCENTRATED';
      riskLevel = 'MODERATE';
      insight = `Growth concentrated in top 3 customers (${(top3GrowthShare * 100).toFixed(0)}% share) - monitor retention closely`;
      recommendation = 'Growth is real but risky - expand selling effort to tier 2 customers';
    } else {
      quality = 'BROAD_BASED';
      riskLevel = 'LOW';
      insight = `Growth well-distributed across customer base - sustainable momentum`;
      recommendation = 'Healthy growth pattern - continue current approach while maintaining breadth';
    }
  } else if (isDeclining) {
    if (top1GrowthShare > 0.5) {
      quality = 'DECLINING_CONCENTRATED';
      riskLevel = 'HIGH';
      insight = `Decline driven by ${customerGrowthContributions[0]?.customer || 'single account'} - specific retention issue`;
      recommendation = 'Targeted recovery possible - investigate specific account situation';
    } else {
      quality = 'DECLINING_BROAD';
      riskLevel = 'CRITICAL';
      insight = `Decline spread across customer base - signals market shift or competitive pressure`;
      recommendation = 'Structural issue - requires product/market reassessment, not just sales effort';
    }
  } else {
    quality = 'STABLE';
    riskLevel = 'LOW';
    insight = 'Flat performance - neither growing nor declining';
    recommendation = 'Seek incremental growth opportunities within existing customer relationships';
  }
  
  return {
    quality,
    qualityColor: getQualityColor(quality),
    riskLevel,
    riskLevelColor: getRiskColor(riskLevel),
    insight,
    recommendation,
    growthVolume,
    top1GrowthShare,
    top3GrowthShare,
    topGrowthContributors: customerGrowthContributions.slice(0, 5),
    topDeclineContributors: customerGrowthContributions.filter(c => c.growthContribution < 0).slice(0, 5),
    salesDirectorVerdict: generateGrowthQualityVerdict(quality, name, top1GrowthShare, mtYoY)
  };
};

const getQualityColor = (quality) => ({
  'BROAD_BASED': '#059669',
  'CONCENTRATED': '#f59e0b',
  'FRAGILE': '#dc2626',
  'STABLE': '#6b7280',
  'DECLINING_CONCENTRATED': '#ea580c',
  'DECLINING_BROAD': '#dc2626'
}[quality] || '#6b7280');

const generateGrowthQualityVerdict = (quality, name, top1Share, yoy) => {
  const growthPct = Math.abs(yoy || 0).toFixed(1);
  switch (quality) {
    case 'BROAD_BASED':
      return `${name}'s ${growthPct}% growth is the right kind of growth - distributed across the customer base. This is sustainable momentum.`;
    case 'CONCENTRATED':
      return `${name}'s ${growthPct}% growth looks good on paper but is concentrated. If top 3 accounts hiccup, this number evaporates.`;
    case 'FRAGILE':
      return `${name}'s ${growthPct}% growth is a house of cards - ${(top1Share * 100).toFixed(0)}% from one customer. This is dependency, not growth.`;
    case 'DECLINING_CONCENTRATED':
      return `${name}'s ${growthPct}% decline is account-specific, not structural. There's a story here - find it and fix it.`;
    case 'DECLINING_BROAD':
      return `${name}'s ${growthPct}% decline across the board is a market signal, not a sales execution issue. Time for strategic review.`;
    default:
      return `${name} is flat - neither winning nor losing. Where's the opportunity?`;
  }
};

// ====== BUDGET GAP OWNERSHIP ================================================
/**
 * Calculates what percentage of remaining budget gap each product can realistically close
 * This is about identifying which products have the CAPACITY and MOMENTUM to close gaps
 */
export const analyzeBudgetGapOwnership = (products, portfolioTotals, monthsRemaining) => {
  const { totalMTBudget, totalMTActual, totalMTFYBudget, totalMTYTDCurrent } = portfolioTotals;
  
  const fyBudget = totalMTFYBudget || totalMTBudget || 0;
  const ytdActual = totalMTYTDCurrent || totalMTActual || 0;
  const remainingGap = Math.max(0, fyBudget - ytdActual);
  const remainingGapMT = remainingGap / 1000;
  
  if (remainingGap <= 0) {
    return {
      status: 'ON_TRACK',
      gapMT: 0,
      productOwnership: [],
      insight: 'Portfolio on track - no gap to close',
      salesDirectorSummary: 'Budget achieved or exceeded. Focus shifts to stretch targets and building pipeline for next year.'
    };
  }
  
  // Calculate each product's potential contribution
  const productOwnership = products
    .filter(p => p.mtBudget > 0 || p.mtFYBudget > 0)
    .map(p => {
      const productBudget = p.mtFYBudget || p.mtBudget || 0;
      const productActual = p.mtYTDCurrent || p.mtActual || 0;
      const productGap = Math.max(0, productBudget - productActual);
      const productGapMT = productGap / 1000;
      
      // Calculate ownership percentage
      const gapOwnershipPct = remainingGap > 0 ? (productGap / remainingGap) * 100 : 0;
      
      // Assess realistic contribution based on momentum
      const hasMomentum = p.mtYoY !== null && p.mtYoY > 0;
      const isStrong = p.mtYoY !== null && p.mtYoY > 15;
      const isAbovePlan = p.mtVariance !== null && p.mtVariance > 0;
      
      // Realistic contribution factor (0.0 to 1.0)
      let realizationFactor = 0.5; // baseline
      if (isAbovePlan) realizationFactor = 0.2; // already maxed
      else if (isStrong) realizationFactor = 0.8;
      else if (hasMomentum) realizationFactor = 0.6;
      else if (p.mtYoY !== null && p.mtYoY < -10) realizationFactor = 0.2; // declining
      
      const realisticContributionMT = productGapMT * realizationFactor;
      const realisticOwnershipPct = remainingGapMT > 0 ? (realisticContributionMT / remainingGapMT) * 100 : 0;
      
      return {
        name: p.name,
        budgetGapMT: productGapMT,
        theoreticalOwnershipPct: gapOwnershipPct,
        realisticOwnershipPct,
        realisticContributionMT,
        realizationFactor,
        hasMomentum,
        isAbovePlan,
        assessment: generateOwnershipAssessment(p.name, gapOwnershipPct, realizationFactor, productGapMT)
      };
    })
    .sort((a, b) => b.realisticOwnershipPct - a.realisticOwnershipPct);
  
  // Calculate coverage
  const totalRealisticContribution = productOwnership.reduce((sum, p) => sum + p.realisticContributionMT, 0);
  const coveragePct = remainingGapMT > 0 ? (totalRealisticContribution / remainingGapMT) * 100 : 100;
  
  // Identify the key contributors
  const keyContributors = productOwnership.filter(p => p.realisticOwnershipPct >= 10);
  const longShots = productOwnership.filter(p => p.theoreticalOwnershipPct >= 10 && p.realisticOwnershipPct < 10);
  
  return {
    status: coveragePct >= 80 ? 'ACHIEVABLE' : coveragePct >= 50 ? 'CHALLENGING' : 'AT_RISK',
    gapMT: remainingGapMT,
    coveragePct,
    productOwnership: productOwnership.slice(0, 10),
    keyContributors,
    longShots,
    insight: generateOwnershipInsight(remainingGapMT, coveragePct, keyContributors.length),
    salesDirectorSummary: generateOwnershipDirectorSummary(remainingGapMT, coveragePct, keyContributors, longShots, monthsRemaining)
  };
};

const generateOwnershipAssessment = (name, theoretical, factor, gapMT) => {
  if (factor >= 0.8) return `${name} is positioned to deliver - strong momentum supports ${gapMT.toFixed(1)} MT contribution`;
  if (factor >= 0.6) return `${name} can contribute with sustained effort - ${gapMT.toFixed(1)} MT achievable`;
  if (factor <= 0.2 && theoretical >= 10) return `${name} owns ${theoretical.toFixed(0)}% of gap on paper but lacks momentum to deliver`;
  return `${name} limited contribution expected at current trajectory`;
};

const generateOwnershipInsight = (gapMT, coverage, contributorCount) => {
  if (coverage >= 80) return `${contributorCount} products have the momentum to close the ${gapMT.toFixed(0)} MT gap`;
  if (coverage >= 50) return `Current momentum covers ~${coverage.toFixed(0)}% of ${gapMT.toFixed(0)} MT gap - need new wins for full closure`;
  return `Realistic product momentum covers only ${coverage.toFixed(0)}% of ${gapMT.toFixed(0)} MT gap - requires breakthrough`;
};

const generateOwnershipDirectorSummary = (gapMT, coverage, key, longShots, months) => {
  const keyNames = key.slice(0, 3).map(k => k.name).join(', ');
  
  if (coverage >= 80) {
    return `The ${gapMT.toFixed(0)} MT gap is closeable. ${keyNames} ${key.length > 1 ? 'are' : 'is'} carrying the weight with ${months} months to deliver. Keep them resourced.`;
  } else if (coverage >= 50) {
    return `We have ${coverage.toFixed(0)}% realistic coverage on the ${gapMT.toFixed(0)} MT gap. ${keyNames} will contribute, but we need customer wins or market acceleration to close fully.`;
  } else {
    const longShotNames = longShots.slice(0, 2).map(l => l.name).join(', ');
    return `Math problem: only ${coverage.toFixed(0)}% coverage on ${gapMT.toFixed(0)} MT gap. ${longShotNames ? `${longShotNames} could help but lack momentum.` : ''} This requires new business or strategic reset.`;
  }
};

// ====== CHURN VOLUME WEIGHTING ==============================================
/**
 * Analyzes churn by VOLUME impact, not just customer count
 * Losing 1 whale customer is worse than losing 5 small ones
 */
export const analyzeChurnVolumeImpact = (lostCustomers, retainedCustomers, newCustomers, portfolioTotals) => {
  const { totalActual, totalPrev } = portfolioTotals;
  
  // Calculate volume by customer segment
  const lostVolume = lostCustomers?.reduce((sum, c) => sum + (c.mtPrev || c.prev || 0), 0) || 0;
  const retainedVolume = retainedCustomers?.reduce((sum, c) => sum + (c.mtActual || c.actual || 0), 0) || 0;
  const newVolume = newCustomers?.reduce((sum, c) => sum + (c.mtActual || c.actual || 0), 0) || 0;
  
  // Calculate weighted metrics
  const totalPrevVolume = totalPrev || (lostVolume + retainedVolume);
  const lostVolumeShare = totalPrevVolume > 0 ? (lostVolume / totalPrevVolume) * 100 : 0;
  const newVolumeShare = totalActual > 0 ? (newVolume / totalActual) * 100 : 0;
  const netVolumeImpact = newVolume - lostVolume;
  
  // Determine severity based on volume impact
  let volumeChurnSeverity, volumeChurnType;
  
  if (lostVolumeShare >= 20) {
    volumeChurnSeverity = 'CRITICAL';
    volumeChurnType = 'WHALE_LOSS';
  } else if (lostVolumeShare >= 10) {
    volumeChurnSeverity = 'HIGH';
    volumeChurnType = lostCustomers?.length === 1 ? 'SINGLE_MAJOR_LOSS' : 'MULTIPLE_SIGNIFICANT';
  } else if (lostVolumeShare >= 5) {
    volumeChurnSeverity = 'MODERATE';
    volumeChurnType = 'MANAGEABLE';
  } else {
    volumeChurnSeverity = 'LOW';
    volumeChurnType = 'NORMAL_TURNOVER';
  }
  
  // Identify whale losses (any single customer >5% of portfolio)
  const whaleLosses = lostCustomers?.filter(c => {
    const share = totalPrevVolume > 0 ? ((c.mtPrev || c.prev || 0) / totalPrevVolume) : 0;
    return share >= 0.05;
  }) || [];
  
  return {
    lostVolumeMT: lostVolume / 1000,
    newVolumeMT: newVolume / 1000,
    netVolumeImpactMT: netVolumeImpact / 1000,
    lostVolumeShare,
    newVolumeShare,
    volumeChurnSeverity,
    volumeChurnSeverityColor: getSeverityColor(volumeChurnSeverity),
    volumeChurnType,
    whaleLosses: whaleLosses.map(w => ({
      name: w.name || w.customerName,
      lostVolumeMT: (w.mtPrev || w.prev || 0) / 1000,
      portfolioShare: totalPrevVolume > 0 ? ((w.mtPrev || w.prev || 0) / totalPrevVolume) * 100 : 0
    })),
    customerCountImpact: {
      lost: lostCustomers?.length || 0,
      gained: newCustomers?.length || 0,
      net: (newCustomers?.length || 0) - (lostCustomers?.length || 0)
    },
    salesDirectorTakeaway: generateVolumeChurnDirectorTakeaway(
      volumeChurnSeverity, lostVolumeShare, netVolumeImpact, whaleLosses.length, lostCustomers?.length || 0
    )
  };
};

const generateVolumeChurnDirectorTakeaway = (severity, lostShare, netImpact, whaleCount, totalLost) => {
  if (severity === 'CRITICAL') {
    return `Critical volume loss: ${lostShare.toFixed(1)}% of last year's base walked out the door. ${whaleCount > 0 ? `Lost ${whaleCount} major account(s).` : ''} This is a retention emergency.`;
  }
  if (severity === 'HIGH') {
    return `Significant volume churn at ${lostShare.toFixed(1)}%. ${netImpact < 0 ? 'New business not keeping pace with losses.' : 'New wins helping offset, but investigate root cause.'} `;
  }
  if (severity === 'MODERATE') {
    return `Manageable churn at ${lostShare.toFixed(1)}% volume loss. Stay vigilant on at-risk accounts but portfolio remains healthy.`;
  }
  return `Healthy portfolio turnover - ${totalLost} customers representing ${lostShare.toFixed(1)}% volume. Focus on growth, not defense.`;
};

// ====== PRODUCT-LEVEL CONCENTRATION =========================================
/**
 * Determines if a specific product is dependent on 1-2 customers
 * Different from portfolio concentration - this is product-specific risk
 */
export const analyzeProductConcentration = (product, customerProductData) => {
  const { name, mtActual } = product;
  
  // Get customer breakdown for this product
  const productCustomers = customerProductData?.filter(cp => 
    cp.productName === name && (cp.mtActual > 0 || cp.actual > 0)
  )
    .map(cp => ({
      customer: cp.customerName,
      volume: cp.mtActual || cp.actual || 0
    }))
    .sort((a, b) => b.volume - a.volume) || [];
  
  const totalVolume = productCustomers.reduce((sum, c) => sum + c.volume, 0);
  
  // Calculate concentration metrics
  const top1Share = productCustomers[0] && totalVolume > 0 
    ? (productCustomers[0].volume / totalVolume) * 100 
    : 0;
  const top3Share = totalVolume > 0 
    ? (productCustomers.slice(0, 3).reduce((sum, c) => sum + c.volume, 0) / totalVolume) * 100 
    : 0;
  
  // Determine concentration level
  let concentrationLevel, concentrationRisk, insight;
  
  if (top1Share >= 50) {
    concentrationLevel = 'SINGLE_CUSTOMER_DEPENDENT';
    concentrationRisk = 'CRITICAL';
    insight = `${name} depends on ${productCustomers[0]?.customer || 'one customer'} for ${top1Share.toFixed(0)}% of volume - single point of failure`;
  } else if (top3Share >= 80) {
    concentrationLevel = 'TOP_3_CONCENTRATED';
    concentrationRisk = 'HIGH';
    insight = `${name} concentrated in top 3 customers (${top3Share.toFixed(0)}%) - vulnerable to account-level disruption`;
  } else if (top3Share >= 60) {
    concentrationLevel = 'MODERATELY_CONCENTRATED';
    concentrationRisk = 'MODERATE';
    insight = `${name} has moderate concentration in top 3 (${top3Share.toFixed(0)}%) - healthy but monitor top accounts`;
  } else {
    concentrationLevel = 'WELL_DISTRIBUTED';
    concentrationRisk = 'LOW';
    insight = `${name} well-distributed across ${productCustomers.length} customers - resilient to individual account fluctuations`;
  }
  
  return {
    productName: name,
    concentrationLevel,
    concentrationRisk,
    concentrationRiskColor: getRiskColor(concentrationRisk),
    top1Share,
    top3Share,
    customerCount: productCustomers.length,
    topCustomers: productCustomers.slice(0, 5).map((c, i) => ({
      rank: i + 1,
      customer: c.customer,
      volumeMT: c.volume / 1000,
      share: totalVolume > 0 ? (c.volume / totalVolume) * 100 : 0
    })),
    insight,
    salesDirectorAction: generateProductConcentrationAction(concentrationLevel, name, productCustomers[0]?.customer)
  };
};

const generateProductConcentrationAction = (level, product, topCustomer) => {
  switch (level) {
    case 'SINGLE_CUSTOMER_DEPENDENT':
      return `${product}: Single-customer dependency on ${topCustomer || 'top account'}. Either deepen that relationship significantly OR diversify. No middle ground.`;
    case 'TOP_3_CONCENTRATED':
      return `${product}: Top 3 dominance means any one departure hurts. Prioritize expansion to tier 2 customers.`;
    case 'MODERATELY_CONCENTRATED':
      return `${product}: Healthy concentration. Focus on protecting top relationships while seeking incremental expansion.`;
    default:
      return `${product}: Well-balanced customer base. Growth can come from deepening any tier.`;
  }
};

// ====== EXPORT COMBINED ANALYSIS ============================================
/**
 * Generates complete sales intelligence analysis for a portfolio
 */
export const generateSalesIntelligence = (options) => {
  const {
    products,
    customers,
    portfolioTotals,
    concentrationRisk,
    retentionAnalysis,
    runRateInfo,
    monthsRemaining,
    hasPreviousYearData,
    customerProductData,
    lostCustomers,
    retainedCustomers,
    newCustomers
  } = options;

  // Total active customers for penetration calculation
  const totalActiveCustomers = customers?.length || 0;

  // Product momentum diagnosis
  const productMomentum = products?.map(p => ({
    ...p,
    momentum: diagnoseProductMomentum(p, portfolioTotals, products)
  })) || [];

  // Customer archetypes
  const customerArchetypes = customers?.map(c => ({
    ...c,
    archetype: classifyCustomerArchetype(c, portfolioTotals, hasPreviousYearData)
  })) || [];

  // Budget gap analysis
  const budgetGapAnalysis = analyzeBudgetGapRealism(products || [], portfolioTotals, monthsRemaining);
  
  // NEW: Budget gap ownership
  const budgetGapOwnership = analyzeBudgetGapOwnership(products || [], portfolioTotals, monthsRemaining);

  // Churn intelligence
  const churnIntelligence = analyzeChurnIntelligence(
    retentionAnalysis || { churnRate: 0, lostCustomers: 0, retentionRate: 1, newCustomers: 0, decliningCustomers: 0 },
    customers,
    portfolioTotals
  );
  
  // NEW: Churn volume impact
  const churnVolumeImpact = analyzeChurnVolumeImpact(
    lostCustomers || [],
    retainedCustomers || [],
    newCustomers || [],
    portfolioTotals
  );

  // Concentration interpretation
  const concentrationInterpretation = interpretConcentrationRisk(
    concentrationRisk || { level: 'LOW', top1Share: 0, top3Share: 0, top5Share: 0, customerCount: 0 },
    portfolioTotals,
    hasPreviousYearData
  );

  // Run rate reality
  const runRateReality = analyzeRunRateReality(runRateInfo, monthsRemaining, portfolioTotals);

  // Volume vs Revenue direction
  const volumeRevenueDirection = analyzeVolumeRevenueDirection(
    { mtYoY: portfolioTotals.mtYoY, mtVsBudget: portfolioTotals.mtVsBudget },
    { amtYoY: portfolioTotals.amtYoY, amtVsBudget: portfolioTotals.amtVsBudget }
  );
  
  // NEW: Product penetration analysis
  const productPenetration = products?.map(p => ({
    ...p,
    penetration: analyzePenetrationStrength(p, products, customerProductData, totalActiveCustomers)
  })) || [];
  
  // NEW: Growth quality analysis
  const productGrowthQuality = products?.map(p => ({
    ...p,
    growthQuality: analyzeGrowthQuality(p, customerProductData, portfolioTotals)
  })) || [];
  
  // NEW: Product concentration analysis
  const productConcentrations = products?.map(p => ({
    ...p,
    concentration: analyzeProductConcentration(p, customerProductData)
  })) || [];

  // Summarize by momentum category
  const momentumSummary = {
    accelerators: productMomentum.filter(p => p.momentum?.category === 'ACCELERATOR'),
    builders: productMomentum.filter(p => p.momentum?.category === 'BUILDER'),
    stabilizers: productMomentum.filter(p => p.momentum?.category === 'STABILIZER'),
    atRisk: productMomentum.filter(p => p.momentum?.category === 'AT_RISK')
  };

  // Summarize by customer archetype
  const archetypeSummary = {
    coreGrowth: customerArchetypes.filter(c => c.archetype?.archetype === 'CORE_GROWTH'),
    momentum: customerArchetypes.filter(c => c.archetype?.archetype === 'MOMENTUM'),
    drifting: customerArchetypes.filter(c => c.archetype?.archetype === 'DRIFTING'),
    lostRisk: customerArchetypes.filter(c => c.archetype?.archetype === 'LOST_RISK'),
    stable: customerArchetypes.filter(c => c.archetype?.archetype === 'STABLE'),
    newAccounts: customerArchetypes.filter(c => c.archetype?.archetype === 'NEW')
  };

  return {
    productMomentum,
    customerArchetypes,
    momentumSummary,
    archetypeSummary,
    budgetGapAnalysis,
    budgetGapOwnership,      // NEW
    churnIntelligence,
    churnVolumeImpact,       // NEW
    concentrationInterpretation,
    runRateReality,
    volumeRevenueDirection,
    productPenetration,      // NEW
    productGrowthQuality,    // NEW
    productConcentrations    // NEW
  };
};

export default {
  diagnoseProductMomentum,
  classifyCustomerArchetype,
  analyzeBudgetGapRealism,
  analyzeChurnIntelligence,
  interpretConcentrationRisk,
  analyzeRunRateReality,
  analyzeVolumeRevenueDirection,
  generateSalesIntelligence,
  // NEW exports
  analyzePenetrationStrength,
  analyzeGrowthQuality,
  analyzeBudgetGapOwnership,
  analyzeChurnVolumeImpact,
  analyzeProductConcentration
};
