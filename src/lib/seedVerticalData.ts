import { prisma } from './db';

let seeded = false;

/**
 * Ensures script templates and content calendar entries exist in the database.
 * Called lazily from API routes — runs once per server lifecycle.
 */
export async function ensureVerticalDataSeeded() {
  if (seeded) return;

  const count = await prisma.scriptTemplate.count();
  if (count > 0) {
    seeded = true;
    return;
  }

  console.log('[seed] ScriptTemplate table is empty — auto-seeding vertical data...');

  // ─── Mortgage Broker Scripts ──────────────────────────────────────
  const mortgageBrokerScripts = [
    {
      vertical: 'MORTGAGE_BROKER',
      category: 'rate_reactions',
      title: 'The Bank of Canada Just Changed Rates',
      scriptBody: `Big news — the Bank of Canada just [raised/lowered/held] rates. Here's what that actually means for you. If you have a variable rate mortgage, your payment just [went up/went down/stayed the same] by about $[X] per $100,000. If you're on a fixed rate, you're not affected right now — but this signals where fixed rates might go at renewal. And if you're buying? This is [good/bad/neutral] news for your purchasing power. Want me to run the numbers for your specific situation? DM me.`,
      tags: ['rates', 'boc', 'variable', 'fixed', 'timely'],
      sortOrder: 1,
    },
    {
      vertical: 'MORTGAGE_BROKER',
      category: 'rate_reactions',
      title: 'Fixed or Variable — Which One Right Now?',
      scriptBody: `The number one question I get: should I go fixed or variable? Here's how I think about it right now. Fixed gives you certainty — you know exactly what you're paying for the next 5 years. Variable is lower today, but it moves with the Bank of Canada rate. Historically, variable has saved borrowers money about 80% of the time. But 'historically' doesn't pay your mortgage if rates spike. My advice? It depends on your risk tolerance and your cash flow. If a $200/month swing would stress you out, go fixed. If you can handle the ups and downs, variable usually wins long-term. DM me and I'll run both scenarios for you.`,
      tags: ['rates', 'fixed', 'variable', 'education'],
      sortOrder: 2,
    },
    {
      vertical: 'MORTGAGE_BROKER',
      category: 'rate_reactions',
      title: 'My Rate Prediction for This Year',
      scriptBody: `Everyone wants to know: where are rates going? Here's what I think based on what I'm seeing. The Bank of Canada is [signaling/holding/cutting] and the bond market is [doing X]. For fixed rates, I expect [prediction]. For variable, [prediction]. But here's what matters more than my prediction: your personal situation. Whether rates go up or down, the right mortgage structure for you depends on your income, your timeline, and your comfort with risk. Don't wait for the 'perfect' rate — it doesn't exist. Let's find the right rate for YOU. DM me.`,
      tags: ['rates', 'predictions', 'education'],
      sortOrder: 3,
    },
    {
      vertical: 'MORTGAGE_BROKER',
      category: 'first_time_buyers',
      title: '5 Things to Do Before Applying for a Mortgage',
      scriptBody: `Thinking about buying your first home? Before you even talk to a lender, do these five things. One: check your credit score — anything under 680 could limit your options. Two: add up your debts. Your debt-to-income ratio matters more than your income alone. Three: save your down payment — and know that less than 20% means you'll pay CMHC insurance. Four: get your documents together — two years of T4s, Notice of Assessment, three months of bank statements. Five: talk to a broker, not just your bank. We have access to 30+ lenders. Your bank has one. DM me 'READY' and let's get you started.`,
      tags: ['first-time', 'pre-approval', 'education', 'checklist'],
      sortOrder: 4,
    },
    {
      vertical: 'MORTGAGE_BROKER',
      category: 'first_time_buyers',
      title: 'Pre-Approved vs Pre-Qualified — Big Difference',
      scriptBody: `If you're buying your first home, here's the single most important thing to do before you start looking: get pre-approved. Not pre-qualified — pre-approved. Here's the difference. Pre-qualification is a guess. Pre-approval means a lender has actually reviewed your income, credit, and debts and said 'yes, we'll lend you this much.' It makes your offer stronger, it tells you your real budget, and it speeds up closing. DM me 'PRE-APPROVAL' and I'll walk you through the process. It takes 20 minutes.`,
      tags: ['first-time', 'pre-approval', 'education'],
      sortOrder: 5,
    },
    {
      vertical: 'MORTGAGE_BROKER',
      category: 'first_time_buyers',
      title: 'How Much Home Can You Actually Afford?',
      scriptBody: `Everyone asks me 'how much can I afford?' and the answer is almost never what they expect. Here's the real math. Banks will approve you for way more than you should actually spend. Just because you qualify for $700,000 doesn't mean your lifestyle can handle the payments. I tell my clients: figure out what monthly payment you're comfortable with FIRST. Then we work backwards to find your price range. Don't forget to budget for property taxes, insurance, maintenance, and — if you're under 20% down — CMHC insurance. Want me to run the numbers? DM me your income and I'll tell you your real budget in 5 minutes.`,
      tags: ['first-time', 'affordability', 'education'],
      sortOrder: 6,
    },
    {
      vertical: 'MORTGAGE_BROKER',
      category: 'renewals',
      title: 'The Renewal Mistake Costing Canadians Thousands',
      scriptBody: `If your mortgage is coming up for renewal, please don't just sign whatever your lender sends you. Here's why: that renewal letter? It's almost never their best rate. They're counting on you being too busy or too loyal to shop around. I've saved clients $10,000 to $30,000 over the life of their mortgage just by shopping their renewal. It takes one phone call. Your lender won't tell you there's a better option. But I will. If your renewal is within the next 120 days, send me a DM.`,
      tags: ['renewal', 'savings', 'action'],
      sortOrder: 7,
    },
    {
      vertical: 'MORTGAGE_BROKER',
      category: 'renewals',
      title: 'When to Start Thinking About Your Renewal',
      scriptBody: `Most people wait until their lender sends the renewal letter to start thinking about their mortgage. That's way too late. Here's my timeline. 120 days before your maturity date: that's when you should start shopping. Most lenders will let you lock in a rate 120 days early. That gives you time to compare, negotiate, and potentially switch lenders without any penalty. If you wait until the last minute, you lose all your leverage. Set a reminder in your phone right now — 4 months before your renewal date. Or better yet, DM me your renewal date and I'll reach out when it's time.`,
      tags: ['renewal', 'planning', 'education'],
      sortOrder: 8,
    },
    {
      vertical: 'MORTGAGE_BROKER',
      category: 'myths',
      title: "You Don't Need 20% Down",
      scriptBody: `Three mortgage myths I hear every single week. Myth one: you need 20% down to buy a home. False — you can buy with as little as 5% down in Canada. Yes, you'll pay CMHC insurance, but it gets you into the market years sooner. Myth two: your bank has the best rate. Also false — mortgage brokers access 30+ lenders and frequently beat bank rates. Myth three: variable rate mortgages are always risky. Not true — historically, variable has saved borrowers money the majority of the time. Know the facts before you decide. Follow me for more.`,
      tags: ['myths', 'education', 'first-time'],
      sortOrder: 9,
    },
    {
      vertical: 'MORTGAGE_BROKER',
      category: 'myths',
      title: "Why Your Bank Isn't Giving You the Best Rate",
      scriptBody: `I need to tell you something your bank doesn't want you to know. When you walk into your bank for a mortgage, they show you THEIR rates. That's it. One lender. One set of products. A mortgage broker? I have access to over 30 lenders — big banks, credit unions, monoline lenders, alternative lenders. I shop your mortgage the way you'd shop for a car. And just like a car, the first price is almost never the best price. The best part? My service costs you nothing. The lender pays my fee. So why wouldn't you at least compare? DM me 'COMPARE' and I'll show you what you're missing.`,
      tags: ['myths', 'broker-value', 'education'],
      sortOrder: 10,
    },
    {
      vertical: 'MORTGAGE_BROKER',
      category: 'personal',
      title: 'Why I Became a Mortgage Broker',
      scriptBody: `People ask me all the time why I got into mortgages. Here's the real answer. I watched someone close to me get a terrible mortgage because they didn't know they had options. They went to their bank, took the first rate offered, and overpaid by thousands over the life of their mortgage. I thought: there has to be a better way. That's what I try to be for my clients — the person who shows you ALL your options, not just the one that's most convenient for the lender. If you've ever felt confused or overwhelmed by the mortgage process, you're not alone. And I'm here to make it simple.`,
      tags: ['personal', 'trust', 'story'],
      sortOrder: 11,
    },
    {
      vertical: 'MORTGAGE_BROKER',
      category: 'personal',
      title: 'What a Day in My Life Actually Looks Like',
      scriptBody: `People think mortgage brokers just process paperwork all day. Here's what my Wednesday actually looked like. 7 AM: checked overnight rate changes and prepped two pre-approval letters. 9 AM: call with a first-time buyer who was told by their bank they didn't qualify — I found them a lender in 20 minutes. 11 AM: renewal negotiation — saved a client $14,000 over 5 years. 1 PM: reviewed self-employed client's financials for an alternative lending solution. 3 PM: three status update calls on active files. 5 PM: DM from someone on Instagram asking about pre-approval — new client. That's why I do this.`,
      tags: ['personal', 'day-in-life', 'trust'],
      sortOrder: 12,
    },
  ];

  // ─── Real Estate Agent Scripts ────────────────────────────────────
  const realEstateAgentScripts = [
    {
      vertical: 'REAL_ESTATE_AGENT',
      category: 'market_updates',
      title: "Here's What Happened in [city] Real Estate This Month",
      scriptBody: `Let's talk about what just happened in [market] real estate. This month we saw [X] homes sell, the average price was $[X], and homes sat on the market for an average of [X] days. What does that mean for you? If you're a buyer, [analysis]. If you're a seller, [analysis]. The key takeaway: [insight]. I track these numbers every single month so you don't have to. Follow me for your monthly [market] market update.`,
      tags: ['market-update', 'data', 'local', 'timely'],
      sortOrder: 1,
    },
    {
      vertical: 'REAL_ESTATE_AGENT',
      category: 'market_updates',
      title: 'What $500K Gets You in [city] Right Now',
      scriptBody: `Want to see what $500,000 actually buys you in [market] right now? I pulled three listings at this price point and the range might surprise you. Option one: [description — neighborhood, size, features]. Option two: [description]. Option three: [description]. The same budget gets you completely different lifestyles depending on the neighborhood. That's why working with someone who knows [market] inside and out matters. DM me your budget and I'll show you what's realistic.`,
      tags: ['market-update', 'budget', 'local', 'education'],
      sortOrder: 2,
    },
    {
      vertical: 'REAL_ESTATE_AGENT',
      category: 'buyer_tips',
      title: '5 Mistakes First-Time Buyers Make',
      scriptBody: `If you're buying your first home, avoid these five mistakes I see all the time. One: looking at houses before getting pre-approved. You're wasting everyone's time, including yours. Two: only looking at the monthly mortgage payment. Property taxes, insurance, maintenance, and closing costs add up fast. Three: waiving the home inspection to win a bidding war. That's how you end up with a $40,000 foundation problem. Four: not hiring your own agent. The listing agent works for the seller, not you. Five: falling in love with a house before running the numbers. Emotions are expensive in real estate. DM me 'BUYER' and I'll walk you through the process step by step.`,
      tags: ['first-time', 'buyer', 'education', 'mistakes'],
      sortOrder: 3,
    },
    {
      vertical: 'REAL_ESTATE_AGENT',
      category: 'buyer_tips',
      title: 'The Offer That Wins in a Bidding War',
      scriptBody: `You found the perfect home — and so did five other buyers. Here's how to write the offer that wins. It's not always about the highest price. Sellers care about three things: price, certainty, and timeline. A clean offer with no conditions, a flexible closing date, and proof of financing often beats a higher price with strings attached. Also — write a personal letter. I know it sounds old-school, but sellers are emotional. They want to know their home is going to someone who loves it. I've had clients win bidding wars $20,000 under the top offer because of their letter. DM me and I'll help you build a winning strategy.`,
      tags: ['buyer', 'bidding', 'strategy', 'negotiation'],
      sortOrder: 4,
    },
    {
      vertical: 'REAL_ESTATE_AGENT',
      category: 'seller_strategies',
      title: '5 Things to Do Before Listing Your Home',
      scriptBody: `Thinking about selling? Do these five things BEFORE you list and you could add thousands to your sale price. One: declutter ruthlessly. Buyers need to imagine their life in your space, not yours. Two: deep clean everything — especially kitchens, bathrooms, and windows. Three: fix the small stuff. That leaky faucet and cracked tile make buyers wonder what ELSE is wrong. Four: boost your curb appeal. First impressions happen before they walk through the door. Five: get a pre-listing inspection. Finding problems early means you control the narrative — not the buyer's inspector. Want a personalized checklist for your home? DM me your address.`,
      tags: ['seller', 'listing', 'preparation', 'checklist'],
      sortOrder: 5,
    },
    {
      vertical: 'REAL_ESTATE_AGENT',
      category: 'seller_strategies',
      title: "Why Your Home Isn't Selling",
      scriptBody: `Your home's been on the market for 30 days with no offers. Here's the truth nobody wants to tell you. In today's market, there are only three reasons a home doesn't sell: price, condition, or exposure. If your agent is marketing it well — professional photos, video tours, social media, open houses — then it's price or condition. And here's the hard part: the market doesn't care what you paid for it, what you spent on renovations, or what your neighbor sold for. The market tells you what your home is worth. If you're not getting offers, the market is speaking. The question is whether you're listening. Thinking about making a change? DM me for a honest assessment.`,
      tags: ['seller', 'pricing', 'tough-love', 'education'],
      sortOrder: 6,
    },
    {
      vertical: 'REAL_ESTATE_AGENT',
      category: 'neighborhood_guides',
      title: 'Living in [Neighborhood] — The Honest Truth',
      scriptBody: `Thinking about moving to [neighborhood in market]? Here's the honest truth from someone who's sold [X] homes there. The pros: [walkability/schools/parks/restaurants/community feel]. The cons: [traffic/parking/noise/price/age of homes]. The average home price right now is around $[X], and most homes sell within [X] days. It's best for [type of buyer — young families, professionals, downsizers]. If you want the full breakdown of any neighborhood in [market], drop the name in the comments and I'll do a deep dive.`,
      tags: ['neighborhood', 'local', 'guide', 'education'],
      sortOrder: 7,
    },
    {
      vertical: 'REAL_ESTATE_AGENT',
      category: 'neighborhood_guides',
      title: 'Best Neighborhoods for First-Time Buyers in [city]',
      scriptBody: `If you're buying your first home in [market], here are three neighborhoods you should be looking at right now. Number one: [neighborhood] — great value, up-and-coming, average price around $[X]. Number two: [neighborhood] — slightly higher price but walkable to everything, perfect for young professionals. Number three: [neighborhood] — if you don't mind a short commute, you get way more space for your money. First-time buyers: stop scrolling Zillow and actually come see these neighborhoods. DM me and I'll set up a tour of all three in one afternoon.`,
      tags: ['neighborhood', 'first-time', 'local', 'guide'],
      sortOrder: 8,
    },
    {
      vertical: 'REAL_ESTATE_AGENT',
      category: 'behind_the_scenes',
      title: 'What Your Agent Actually Does Behind the Scenes',
      scriptBody: `People think real estate agents just open doors and collect a check. Let me show you what actually happens behind the scenes on a single transaction. Before showing: researching comparable sales, checking tax records, reviewing the listing history. During showings: evaluating the condition, estimating repair costs, spotting red flags you'd miss. Writing the offer: negotiating price, terms, conditions, timelines — sometimes going back and forth five or six times. After acceptance: coordinating inspectors, appraisers, lenders, lawyers, and the other agent — putting out fires daily. From first showing to closing day, I'm working 40+ hours on YOUR deal alone. And that's exactly how it should be.`,
      tags: ['behind-the-scenes', 'agent-value', 'trust', 'education'],
      sortOrder: 9,
    },
    {
      vertical: 'REAL_ESTATE_AGENT',
      category: 'behind_the_scenes',
      title: 'Day in the Life of a Real Estate Agent',
      scriptBody: `People think being a real estate agent is glamorous. Here's what my Tuesday actually looked like. 7 AM: checked new listings, prepped for a morning showing. 9 AM: met first-time buyers at a condo — they loved it but the parking was a dealbreaker. 11 AM: listing appointment — walked through a home, discussed pricing strategy, took notes for the photographer. 1 PM: lunch at my desk, three phone calls about an offer that's going sideways. 3 PM: wrote a counter-offer, negotiated $15K off the price for my buyer. 5 PM: open house prep for Saturday. 7 PM: responded to 12 DMs from people asking about the market. This job is 24/7. But handing someone the keys to their first home? Worth every late night.`,
      tags: ['behind-the-scenes', 'day-in-life', 'personal', 'trust'],
      sortOrder: 10,
    },
    {
      vertical: 'REAL_ESTATE_AGENT',
      category: 'personal',
      title: 'Why I Became a Real Estate Agent',
      scriptBody: `People ask me why I got into real estate. Here's the real answer. I've always been obsessed with homes — not just the buildings, but what they represent. Stability. Roots. The place where your kids take their first steps. I watched my parents buy their first home and I still remember the look on their faces. Now I get to create that moment for other people. Is it stressful? Absolutely. Are the hours insane? Yes. Do I sometimes miss weekends and evenings? All the time. But there's nothing like the moment at the closing table when someone realizes they just became a homeowner. That's why I do this. And that's why I'm not going anywhere.`,
      tags: ['personal', 'trust', 'story', 'motivation'],
      sortOrder: 11,
    },
    {
      vertical: 'REAL_ESTATE_AGENT',
      category: 'personal',
      title: 'The Hardest Part of Real Estate Nobody Talks About',
      scriptBody: `I need to be honest about something. The hardest part of real estate isn't the long hours or the competitive market. It's when you can't help someone. When a first-time buyer loses their dream home to a cash offer. When someone's life changes — divorce, job loss, death in the family — and selling the home becomes emotional, not just financial. When you've done everything right and the deal still falls apart. Those moments stick with you. But they also make you better. They make you fight harder for the next client. They remind you that behind every transaction is a real person going through one of the biggest decisions of their life. That's why I take this personally. Because it IS personal.`,
      tags: ['personal', 'vulnerability', 'trust', 'authenticity'],
      sortOrder: 12,
    },
  ];

  // ─── Financial Advisor Scripts ────────────────────────────────────
  const financialAdvisorScripts = [
    {
      vertical: 'FINANCIAL_ADVISOR',
      category: 'education',
      title: 'Roth IRA vs Traditional IRA — Which Is Right for You?',
      scriptBody: `The number one question I get: should I contribute to a Roth IRA or a Traditional IRA? Here's the simple answer. If you think you'll be in a higher tax bracket in retirement, go Roth — you pay taxes now and withdraw tax-free later. If you think you'll be in a lower bracket, go Traditional — you get the tax break now. But here's what most people miss: it's not either/or. Many of my clients do BOTH. The Roth gives you tax-free income in retirement, and the Traditional reduces your taxable income today. The right mix depends on your income, your age, and your retirement timeline. DM me 'IRA' and I'll help you figure out the right split.`,
      tags: ['education', 'ira', 'retirement', 'tax-planning'],
      sortOrder: 1,
    },
    {
      vertical: 'FINANCIAL_ADVISOR',
      category: 'education',
      title: 'How Much Should You Actually Have Saved by 30? 40? 50?',
      scriptBody: `Let's talk about retirement savings benchmarks. By 30, aim to have 1x your annual salary saved. By 40, 3x. By 50, 6x. By 60, 8x. By retirement, 10-12x. Now — if you're behind, don't panic. These are guidelines, not rules. The most important number isn't what you've saved — it's your savings RATE. If you're saving 15-20% of your income consistently, you're on track even if you started late. The magic of compound growth means every dollar you invest today is worth significantly more than one you invest 10 years from now. The best time to start was 10 years ago. The second best time is today. DM me and I'll run a personalized projection for you.`,
      tags: ['education', 'retirement', 'benchmarks', 'savings'],
      sortOrder: 2,
    },
    {
      vertical: 'FINANCIAL_ADVISOR',
      category: 'myth_busting',
      title: "You Don't Need to Be Rich to Work With a Financial Advisor",
      scriptBody: `The biggest myth in my industry: financial advisors are only for rich people. False. Some of my most impactful work has been with people earning $60,000 to $100,000 who just needed a plan. Here's what a good advisor actually does for you: creates a budget that works, maximizes your employer 401(k) match (free money you might be leaving on the table), builds an emergency fund strategy, sets up tax-efficient investing, and creates a roadmap to your specific goals. You don't need a million dollars to start. You need a plan. DM me 'PLAN' and let's build yours.`,
      tags: ['myths', 'accessibility', 'trust-building', 'education'],
      sortOrder: 3,
    },
    {
      vertical: 'FINANCIAL_ADVISOR',
      category: 'myth_busting',
      title: 'Why Timing the Market Always Fails',
      scriptBody: `I need to tell you something that could save you a fortune: stop trying to time the market. I know — you see headlines about crashes and corrections and your instinct says 'sell everything and wait.' Here's the data. If you invested $10,000 in the S&P 500 20 years ago and stayed invested, you'd have roughly $60,000 today. But if you missed just the 10 best days — ten days out of 7,300 — you'd have less than $30,000. Half. The best days often come right after the worst days. The people who panic-sell lock in their losses and miss the recovery. Time IN the market beats timing the market. Every single time. Save this for the next time you're tempted to sell.`,
      tags: ['myths', 'investing', 'market', 'education'],
      sortOrder: 4,
    },
    {
      vertical: 'FINANCIAL_ADVISOR',
      category: 'trust_building',
      title: 'Questions to Ask Before Hiring a Financial Advisor',
      scriptBody: `Before you hire a financial advisor, ask these five questions. One: are you a fiduciary? This means they're legally required to act in YOUR best interest, not theirs. If they hesitate, walk away. Two: how do you get paid? Fee-only means they charge you directly. Commission-based means they earn money when they sell you products. Know the difference. Three: what's your investment philosophy? You want someone who has a clear, evidence-based approach — not someone chasing hot stocks. Four: what's your typical client look like? Make sure you're not too small or too large for their practice. Five: can I see a sample financial plan? If they can't show you what the work looks like, they're selling, not planning. I'm happy to answer all five of these. DM me.`,
      tags: ['trust', 'advisor-selection', 'education', 'transparency'],
      sortOrder: 5,
    },
    {
      vertical: 'FINANCIAL_ADVISOR',
      category: 'trust_building',
      title: 'The Difference Between a Financial Advisor and a Salesperson',
      scriptBody: `Not all financial advisors are the same. Some are advisors. Some are salespeople in disguise. Here's how to tell the difference. A salesperson pushes products — annuities, whole life insurance, loaded mutual funds — and earns a commission every time you buy. An advisor creates a plan FIRST, then recommends solutions that fit the plan. A salesperson talks about returns. An advisor talks about YOUR goals. A salesperson makes you feel rushed. An advisor makes you feel heard. The simplest test: ask them 'are you a fiduciary?' If the answer isn't an immediate yes, you're talking to a salesperson. I'm a fiduciary. I work for you, not a product company. DM me if you want to know the difference firsthand.`,
      tags: ['trust', 'fiduciary', 'transparency', 'education'],
      sortOrder: 6,
    },
    {
      vertical: 'FINANCIAL_ADVISOR',
      category: 'seasonal',
      title: '5 Smart Money Moves Before December 31',
      scriptBody: `The year is almost over and there are five money moves you should make before December 31. One: max out your 401(k) or IRA contributions — you can't go back and contribute for last year. Two: harvest your tax losses. If you have investments that are down, selling them can offset your gains and reduce your tax bill. Three: use your FSA or HSA funds before they expire. Four: review your beneficiaries — life changes (marriage, kids, divorce) mean your accounts might go to the wrong person. Five: schedule a year-end review with your advisor. Fifteen minutes now could save you thousands in April. DM me 'YEAR-END' and I'll run through your checklist.`,
      tags: ['seasonal', 'tax', 'year-end', 'checklist'],
      sortOrder: 7,
    },
    {
      vertical: 'FINANCIAL_ADVISOR',
      category: 'seasonal',
      title: 'Tax Season: 3 Things Your CPA Wishes You Knew',
      scriptBody: `Tax season is here and your CPA wishes you knew these three things. One: tax PLANNING happens all year, not just in April. By the time you're filing, it's too late to make most strategic moves. Two: your CPA files your taxes — but a financial advisor PLANS your taxes. We work together, not instead of each other. Three: the goal isn't to pay the least tax this year — it's to pay the least tax over your LIFETIME. Sometimes paying more now saves you significantly more later. If your only tax strategy is 'send everything to my CPA in March,' you're probably overpaying. DM me and I'll show you what proactive tax planning looks like.`,
      tags: ['seasonal', 'tax', 'education', 'planning'],
      sortOrder: 8,
    },
    {
      vertical: 'FINANCIAL_ADVISOR',
      category: 'social_proof',
      title: 'How I Helped a Client Retire 5 Years Early',
      scriptBody: `One of my favorite client stories. A couple came to me at 50, convinced they couldn't retire until 67. They had decent savings but no real plan. We did three things. One: consolidated their five old 401(k) accounts into a single managed portfolio — they were paying duplicate fees and had overlapping investments. Two: optimized their tax strategy — we shifted some money into Roth accounts during lower-income years, which will save them over $100,000 in retirement taxes. Three: built a withdrawal strategy that maximizes Social Security by delaying benefits. Result? They're retiring at 62. Five years early. Not because they made more money — because they had a plan. That's what financial planning does. DM me if you want to know YOUR earliest possible retirement date.`,
      tags: ['social-proof', 'retirement', 'client-story', 'results'],
      sortOrder: 9,
    },
    {
      vertical: 'FINANCIAL_ADVISOR',
      category: 'social_proof',
      title: 'The $200K Mistake I Saved a Client From Making',
      scriptBody: `A client called me last year wanting to cash out their entire 401(k) to pay off their mortgage. On the surface, it sounds smart — no more mortgage payment. But here's what would have actually happened. They would have paid roughly $80,000 in federal and state income taxes on the withdrawal. Plus a 10% early withdrawal penalty of $20,000 because they were under 59½. And they would have lost the compound growth on that money — which over 15 years would have been worth an additional $100,000+. Total cost: over $200,000 to eliminate a $180,000 mortgage at 3.5% interest. We found a better solution. We refinanced at a lower rate, increased their monthly 401(k) contribution, and they'll be debt-free AND have a bigger retirement fund. Always run the numbers before making big financial moves. DM me before you make yours.`,
      tags: ['social-proof', 'mistake-prevention', 'education', 'results'],
      sortOrder: 10,
    },
    {
      vertical: 'FINANCIAL_ADVISOR',
      category: 'personal_brand',
      title: 'Why I Became a Financial Advisor',
      scriptBody: `People ask me why I became a financial advisor. Here's the honest answer. I grew up in a household where money was stressful. Not because we didn't have enough — because nobody talked about it. No plan, no budget, no strategy. Just anxiety. I watched smart, hardworking people make avoidable mistakes because nobody taught them how money actually works. I became a financial advisor because I believe everyone deserves a plan. Not just the wealthy. Not just the financially savvy. Everyone. My job is to take the stress out of money and replace it with confidence. If money keeps you up at night, you don't need more money — you need a plan. DM me and let's build yours.`,
      tags: ['personal', 'trust', 'story', 'motivation'],
      sortOrder: 11,
    },
    {
      vertical: 'FINANCIAL_ADVISOR',
      category: 'personal_brand',
      title: 'What a Day in My Life Actually Looks Like',
      scriptBody: `People think financial advisors sit in fancy offices watching stock tickers all day. Here's what my Thursday actually looked like. 7 AM: reviewed overnight market moves, prepped for two client meetings. 9 AM: annual review with a couple planning for retirement — adjusted their allocation and updated their withdrawal strategy. 11 AM: call with a 28-year-old who just got their first real paycheck and wanted to start investing. Set up their Roth IRA and automated contributions. 1 PM: tax planning call with a business owner — restructured their compensation to save $15,000 in taxes. 3 PM: researched new fund options for client portfolios. 5 PM: recorded this video. No stock tickers. No Wall Street chaos. Just real people, real plans, real results. That's financial planning.`,
      tags: ['personal', 'day-in-life', 'trust', 'transparency'],
      sortOrder: 12,
    },
  ];

  // ─── Build script insert records ──────────────────────────────────
  const allScripts = [
    ...mortgageBrokerScripts,
    ...realEstateAgentScripts,
    ...financialAdvisorScripts,
  ].map((s) => ({
    ...s,
    wordCount: s.scriptBody.split(/\s+/).length,
    isActive: true,
  }));

  await prisma.scriptTemplate.createMany({ data: allScripts });
  console.log(`[seed] Inserted ${allScripts.length} script templates.`);

  // ─── Content Calendar ─────────────────────────────────────────────
  const calendarCount = await prisma.contentCalendar.count();
  if (calendarCount === 0) {
    const calendarEntries: {
      vertical: string;
      month: number;
      title: string;
      description: string;
      contentAngle: string;
      category: string;
      isRecurring: boolean;
      specificDate?: Date;
    }[] = [
      // ── Mortgage Broker ─────────────────────────────────────────
      { vertical: 'MORTGAGE_BROKER', month: 1, title: 'New Year Financial Reset', description: 'Pre-approval basics, credit score improvement, new year home buying goals', contentAngle: 'New year, new home? Start here', category: 'first_time_buyers', isRecurring: true },
      { vertical: 'MORTGAGE_BROKER', month: 1, title: 'Rate Outlook for the Year', description: 'Predictions for where rates are heading, what it means for buyers', contentAngle: 'My rate prediction for 2026', category: 'rate_reactions', isRecurring: true },
      { vertical: 'MORTGAGE_BROKER', month: 2, title: 'Fixed vs Variable Deep-Dive', description: 'With spring market approaching, help buyers choose the right structure', contentAngle: "Fixed or variable right now? Here's my honest take", category: 'rate_reactions', isRecurring: true },
      { vertical: 'MORTGAGE_BROKER', month: 2, title: 'Spring Buying Prep', description: 'Pre-approval checklist, document prep, getting mortgage-ready', contentAngle: 'Spring market is coming — get pre-approved NOW', category: 'first_time_buyers', isRecurring: true },
      { vertical: 'MORTGAGE_BROKER', month: 3, title: 'BoC Rate Decision Reaction', description: 'React to the latest Bank of Canada rate announcement', contentAngle: "The BoC just announced — here's what it means for your mortgage", category: 'rate_reactions', isRecurring: true, specificDate: new Date('2026-03-12T12:00:00Z') },
      { vertical: 'MORTGAGE_BROKER', month: 3, title: 'First-Time Buyer Season Kickoff', description: 'Spring is peak first-time buyer season, address common questions', contentAngle: 'Buying your first home this spring? Start here', category: 'first_time_buyers', isRecurring: true },
      { vertical: 'MORTGAGE_BROKER', month: 4, title: 'BoC Rate Decision Reaction', description: 'April rate decision reaction and analysis', contentAngle: "Rate decision day — here's my breakdown", category: 'rate_reactions', isRecurring: true, specificDate: new Date('2026-04-16T12:00:00Z') },
      { vertical: 'MORTGAGE_BROKER', month: 4, title: 'Stress Test Explainer', description: "Most buyers don't understand the stress test — explain it simply", contentAngle: 'How much can you ACTUALLY afford? The stress test explained', category: 'first_time_buyers', isRecurring: true },
      { vertical: 'MORTGAGE_BROKER', month: 5, title: 'Refinancing Check-In', description: 'With spring in full swing, many homeowners should consider refinancing', contentAngle: 'Should you refinance right now? 3 questions to ask yourself', category: 'renewals', isRecurring: true },
      { vertical: 'MORTGAGE_BROKER', month: 6, title: 'BoC Rate Decision Reaction', description: 'Mid-year rate decision', contentAngle: 'June rate decision — what it means for summer buyers', category: 'rate_reactions', isRecurring: true, specificDate: new Date('2026-06-04T12:00:00Z') },
      { vertical: 'MORTGAGE_BROKER', month: 6, title: 'HELOC Strategies', description: 'Home equity lines of credit for renovations, investing, or debt consolidation', contentAngle: 'Your home equity is a financial tool — here\'s how to use it', category: 'myths', isRecurring: true },
      { vertical: 'MORTGAGE_BROKER', month: 7, title: 'BoC Rate Decision Reaction', description: 'Summer rate decision', contentAngle: "Mid-summer rate check — here's where we stand", category: 'rate_reactions', isRecurring: true, specificDate: new Date('2026-07-16T12:00:00Z') },
      { vertical: 'MORTGAGE_BROKER', month: 7, title: 'Renewal Season Alert', description: 'Many 5-year terms from 2021 are coming up for renewal', contentAngle: "Your renewal is coming — DON'T just sign what they send", category: 'renewals', isRecurring: true },
      { vertical: 'MORTGAGE_BROKER', month: 8, title: 'Self-Employed Mortgage Guide', description: 'Summer slowdown content — educational deep-dive for self-employed', contentAngle: "Self-employed? Here's how to get approved for a mortgage", category: 'myths', isRecurring: true },
      { vertical: 'MORTGAGE_BROKER', month: 9, title: 'BoC Rate Decision Reaction', description: 'Fall rate decision', contentAngle: 'September rate decision — fall market outlook', category: 'rate_reactions', isRecurring: true, specificDate: new Date('2026-09-10T12:00:00Z') },
      { vertical: 'MORTGAGE_BROKER', month: 9, title: 'Fall Market Mortgage Prep', description: 'Fall buying season prep for buyers', contentAngle: 'Fall market is heating up — are you mortgage-ready?', category: 'first_time_buyers', isRecurring: true },
      { vertical: 'MORTGAGE_BROKER', month: 10, title: 'BoC Rate Decision Reaction', description: 'October rate decision', contentAngle: 'Rate decision day — closing before year-end?', category: 'rate_reactions', isRecurring: true, specificDate: new Date('2026-10-29T12:00:00Z') },
      { vertical: 'MORTGAGE_BROKER', month: 10, title: 'Year-End Tax Planning & Mortgages', description: 'How mortgage interest, HBP repayments, and year-end moves affect taxes', contentAngle: 'Smart mortgage moves to make before December 31', category: 'myths', isRecurring: true },
      { vertical: 'MORTGAGE_BROKER', month: 11, title: 'Renewal Negotiation Tips', description: 'Year-end renewal push — many terms expiring', contentAngle: 'How I saved a client $14,000 on their renewal', category: 'renewals', isRecurring: true },
      { vertical: 'MORTGAGE_BROKER', month: 12, title: 'Year in Review & Predictions', description: 'Recap the mortgage year and predict next year', contentAngle: "2026 mortgage year in review — and what's coming in 2027", category: 'rate_reactions', isRecurring: true },
      { vertical: 'MORTGAGE_BROKER', month: 12, title: 'Holiday Gratitude & Client Wins', description: 'Personal content — thank clients, share wins from the year', contentAngle: 'Thank you to everyone who trusted me with their biggest financial decision this year', category: 'personal', isRecurring: true },
      // ── Real Estate Agent ──────────────────────────────────────
      { vertical: 'REAL_ESTATE_AGENT', month: 1, title: 'New Year Market Predictions', description: 'Share your predictions for the local housing market in the new year', contentAngle: 'My [market] housing market prediction for this year', category: 'market_updates', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 1, title: 'Buyer Resolution Content', description: 'New year motivation for people thinking about buying their first home', contentAngle: "Make this the year you stop renting — here's how to start", category: 'buyer_tips', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 2, title: 'Spring Market Prep for Sellers', description: 'Now is the time to start preparing to list — beat the spring rush', contentAngle: 'Thinking about selling this spring? Start prepping NOW', category: 'seller_strategies', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 2, title: 'Valentine\'s Day — Love Your Neighborhood', description: "Fun neighborhood spotlight tied to Valentine's Day", contentAngle: '5 things I love about living in [neighborhood]', category: 'neighborhood_guides', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 3, title: 'Spring Market Kickoff', description: 'The busiest season is here — monthly market data + what to expect', contentAngle: "Spring market is HERE — here's what I'm seeing in [market]", category: 'market_updates', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 3, title: 'First-Time Buyer Guide', description: 'Peak season for first-time buyers entering the market', contentAngle: 'First-time buyer? The 5 things you need to do before house hunting', category: 'buyer_tips', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 4, title: 'Monthly Market Snapshot', description: "Share last month's sales data and trends", contentAngle: "March numbers are in — here's what happened in [market]", category: 'market_updates', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 4, title: 'Curb Appeal Season', description: 'Spring landscaping and exterior prep tips for sellers', contentAngle: 'Your front yard is your first showing — 5 curb appeal fixes under $500', category: 'seller_strategies', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 5, title: 'Open House Season', description: 'How to prepare for and get the most out of open houses', contentAngle: "Going to open houses this weekend? Here's what to actually look for", category: 'buyer_tips', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 6, title: 'Mid-Year Market Check-In', description: 'Half-year market analysis and summer outlook', contentAngle: "Half the year is done — here's where [market] real estate stands", category: 'market_updates', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 6, title: 'Summer Neighborhood Spotlight', description: 'Highlight neighborhoods that shine in summer — patios, parks, community events', contentAngle: 'The best neighborhood in [market] for summer vibes', category: 'neighborhood_guides', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 7, title: 'Summer Market Reality Check', description: "Summer slowdown vs. opportunity — what to expect", contentAngle: "Is summer a bad time to buy? Here's the truth", category: 'buyer_tips', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 8, title: 'Back to School & Family Neighborhoods', description: 'Neighborhood guides focused on schools and family-friendliness', contentAngle: 'Best neighborhoods in [market] for families with kids', category: 'neighborhood_guides', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 8, title: 'Fall Listing Prep', description: 'Get sellers thinking about fall listings before the rush', contentAngle: "Want to sell this fall? Start here — it's closer than you think", category: 'seller_strategies', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 9, title: 'Fall Market Kickoff', description: "Second busiest season — what's happening in the market", contentAngle: 'Fall market is heating up — here\'s what buyers and sellers need to know', category: 'market_updates', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 10, title: 'Seasonal Home Maintenance Tips', description: 'Helpful content that builds trust — winterizing your home', contentAngle: '5 things to do before winter hits (your home will thank you)', category: 'behind_the_scenes', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 10, title: 'Year-End Market Update', description: 'Q3 data and end-of-year market trajectory', contentAngle: "Q3 numbers are in — here's how [market] is closing out the year", category: 'market_updates', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 11, title: 'Holiday Buying Opportunity', description: "Fewer buyers in the market = opportunity for those willing to look", contentAngle: "The best time to buy might be when nobody else is looking", category: 'buyer_tips', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 12, title: 'Year in Review & Predictions', description: 'Recap the local market year and preview next year', contentAngle: "[market] real estate year in review — and what's coming next", category: 'market_updates', isRecurring: true },
      { vertical: 'REAL_ESTATE_AGENT', month: 12, title: 'Holiday Gratitude & Client Wins', description: 'Personal content — thank clients, share highlights from the year', contentAngle: 'Thank you to everyone who trusted me with their biggest investment this year', category: 'personal', isRecurring: true },
      // ── Financial Advisor ──────────────────────────────────────
      { vertical: 'FINANCIAL_ADVISOR', month: 1, title: 'New Year Financial Reset', description: 'Help people set financial goals and build a plan for the new year', contentAngle: '3 money goals everyone should set this year', category: 'education', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 1, title: '401(k) Contribution Limits Update', description: 'New year = new contribution limits. Educate your audience.', contentAngle: "New 401(k) limits just dropped — here's what changed", category: 'education', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 2, title: 'Tax Season Prep', description: 'Get ahead of tax season with planning content', contentAngle: 'Tax season is coming — 3 things to do before you file', category: 'seasonal', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 2, title: 'Couples & Money', description: "Valentine's Day angle — how couples should manage finances together", contentAngle: 'The money conversation every couple needs to have', category: 'trust_building', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 3, title: 'Market Volatility Response', description: 'Q1 market swings — reassure and educate', contentAngle: "The market dropped — here's what you should (and shouldn't) do", category: 'myth_busting', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 3, title: 'Spring Financial Checkup', description: 'Encourage a mid-Q1 financial review', contentAngle: "When's the last time you actually looked at your 401(k)?", category: 'education', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 4, title: 'Tax Day Content', description: 'Last-minute tax tips and IRA contribution deadline', contentAngle: "You have until April 15 to contribute to last year's IRA", category: 'seasonal', isRecurring: true, specificDate: new Date('2026-04-15T12:00:00Z') },
      { vertical: 'FINANCIAL_ADVISOR', month: 4, title: 'Post-Tax Season Planning', description: 'Now that taxes are done, start planning for NEXT year', contentAngle: 'Your taxes are filed — now do THIS to pay less next year', category: 'seasonal', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 5, title: 'Graduation & Young Professional Finance', description: 'Content for new grads and young professionals starting their careers', contentAngle: 'Just graduated? Here\'s the money playbook I wish someone gave me', category: 'education', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 6, title: 'Mid-Year Financial Review', description: 'Encourage clients and prospects to do a mid-year check-in', contentAngle: "Half the year is gone — are you on track? Here's how to check", category: 'trust_building', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 6, title: 'Summer Market Commentary', description: 'Share your market outlook for the second half of the year', contentAngle: 'My market outlook for the rest of the year', category: 'education', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 7, title: 'Financial Independence Day', description: "Independence Day angle — what financial independence actually means", contentAngle: "What 'financial independence' actually means (it's not what you think)", category: 'myth_busting', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 8, title: 'Back-to-School 529 Plans', description: 'Education savings content timed to back-to-school season', contentAngle: "Paying for college? Here's why you need a 529 plan", category: 'education', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 8, title: 'Small Business Retirement Plans', description: 'Summer content for business owners — SEP IRA, Solo 401(k)', contentAngle: "Business owners: you're probably not using the best retirement account", category: 'education', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 9, title: 'Open Enrollment Prep', description: 'Benefits enrollment season is coming — help people prepare', contentAngle: 'Open enrollment is coming — 3 benefits most people get wrong', category: 'seasonal', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 10, title: 'Open Enrollment Season', description: 'Deep-dive into health insurance, FSA/HSA, and benefit optimization', contentAngle: 'Open enrollment mistakes that could cost you thousands', category: 'seasonal', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 10, title: 'Q3 Market Recap', description: 'Third quarter market review and year-end outlook', contentAngle: "Q3 is done — here's where the market stands and what I expect next", category: 'education', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 11, title: 'Year-End Tax Planning', description: 'Critical tax planning window before December 31', contentAngle: "5 tax moves to make before December 31 (or you'll miss them forever)", category: 'seasonal', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 12, title: 'Year in Review & Market Outlook', description: 'Recap the financial year and share predictions for next year', contentAngle: "The financial year in review — and what I'm watching in the year ahead", category: 'education', isRecurring: true },
      { vertical: 'FINANCIAL_ADVISOR', month: 12, title: 'Holiday Gratitude & Client Wins', description: 'Personal content — thank clients, share success stories from the year', contentAngle: 'Thank you to everyone who trusted me with their financial future this year', category: 'personal_brand', isRecurring: true },
    ];

    await prisma.contentCalendar.createMany({ data: calendarEntries });
    console.log(`[seed] Inserted ${calendarEntries.length} content calendar entries.`);
  }

  seeded = true;
  console.log('[seed] Vertical data seeding complete.');
}
