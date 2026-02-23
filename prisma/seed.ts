import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const mortgageBrokerScripts = [
  {
    vertical: "MORTGAGE_BROKER",
    category: "rate_reactions",
    title: "The Bank of Canada Just Changed Rates",
    scriptBody: `Big news — the Bank of Canada just [raised/lowered/held] rates. Here's what that actually means for you. If you have a variable rate mortgage, your payment just [went up/went down/stayed the same] by about $[X] per $100,000. If you're on a fixed rate, you're not affected right now — but this signals where fixed rates might go at renewal. And if you're buying? This is [good/bad/neutral] news for your purchasing power. Want me to run the numbers for your specific situation? DM me.`,
    tags: ["rates", "boc", "variable", "fixed", "timely"],
    sortOrder: 1,
  },
  {
    vertical: "MORTGAGE_BROKER",
    category: "rate_reactions",
    title: "Fixed or Variable — Which One Right Now?",
    scriptBody: `The number one question I get: should I go fixed or variable? Here's how I think about it right now. Fixed gives you certainty — you know exactly what you're paying for the next 5 years. Variable is lower today, but it moves with the Bank of Canada rate. Historically, variable has saved borrowers money about 80% of the time. But 'historically' doesn't pay your mortgage if rates spike. My advice? It depends on your risk tolerance and your cash flow. If a $200/month swing would stress you out, go fixed. If you can handle the ups and downs, variable usually wins long-term. DM me and I'll run both scenarios for you.`,
    tags: ["rates", "fixed", "variable", "education"],
    sortOrder: 2,
  },
  {
    vertical: "MORTGAGE_BROKER",
    category: "rate_reactions",
    title: "My Rate Prediction for This Year",
    scriptBody: `Everyone wants to know: where are rates going? Here's what I think based on what I'm seeing. The Bank of Canada is [signaling/holding/cutting] and the bond market is [doing X]. For fixed rates, I expect [prediction]. For variable, [prediction]. But here's what matters more than my prediction: your personal situation. Whether rates go up or down, the right mortgage structure for you depends on your income, your timeline, and your comfort with risk. Don't wait for the 'perfect' rate — it doesn't exist. Let's find the right rate for YOU. DM me.`,
    tags: ["rates", "predictions", "education"],
    sortOrder: 3,
  },
  {
    vertical: "MORTGAGE_BROKER",
    category: "first_time_buyers",
    title: "5 Things to Do Before Applying for a Mortgage",
    scriptBody: `Thinking about buying your first home? Before you even talk to a lender, do these five things. One: check your credit score — anything under 680 could limit your options. Two: add up your debts. Your debt-to-income ratio matters more than your income alone. Three: save your down payment — and know that less than 20% means you'll pay CMHC insurance. Four: get your documents together — two years of T4s, Notice of Assessment, three months of bank statements. Five: talk to a broker, not just your bank. We have access to 30+ lenders. Your bank has one. DM me 'READY' and let's get you started.`,
    tags: ["first-time", "pre-approval", "education", "checklist"],
    sortOrder: 4,
  },
  {
    vertical: "MORTGAGE_BROKER",
    category: "first_time_buyers",
    title: "Pre-Approved vs Pre-Qualified — Big Difference",
    scriptBody: `If you're buying your first home, here's the single most important thing to do before you start looking: get pre-approved. Not pre-qualified — pre-approved. Here's the difference. Pre-qualification is a guess. Pre-approval means a lender has actually reviewed your income, credit, and debts and said 'yes, we'll lend you this much.' It makes your offer stronger, it tells you your real budget, and it speeds up closing. DM me 'PRE-APPROVAL' and I'll walk you through the process. It takes 20 minutes.`,
    tags: ["first-time", "pre-approval", "education"],
    sortOrder: 5,
  },
  {
    vertical: "MORTGAGE_BROKER",
    category: "first_time_buyers",
    title: "How Much Home Can You Actually Afford?",
    scriptBody: `Everyone asks me 'how much can I afford?' and the answer is almost never what they expect. Here's the real math. Banks will approve you for way more than you should actually spend. Just because you qualify for $700,000 doesn't mean your lifestyle can handle the payments. I tell my clients: figure out what monthly payment you're comfortable with FIRST. Then we work backwards to find your price range. Don't forget to budget for property taxes, insurance, maintenance, and — if you're under 20% down — CMHC insurance. Want me to run the numbers? DM me your income and I'll tell you your real budget in 5 minutes.`,
    tags: ["first-time", "affordability", "education"],
    sortOrder: 6,
  },
  {
    vertical: "MORTGAGE_BROKER",
    category: "renewals",
    title: "The Renewal Mistake Costing Canadians Thousands",
    scriptBody: `If your mortgage is coming up for renewal, please don't just sign whatever your lender sends you. Here's why: that renewal letter? It's almost never their best rate. They're counting on you being too busy or too loyal to shop around. I've saved clients $10,000 to $30,000 over the life of their mortgage just by shopping their renewal. It takes one phone call. Your lender won't tell you there's a better option. But I will. If your renewal is within the next 120 days, send me a DM.`,
    tags: ["renewal", "savings", "action"],
    sortOrder: 7,
  },
  {
    vertical: "MORTGAGE_BROKER",
    category: "renewals",
    title: "When to Start Thinking About Your Renewal",
    scriptBody: `Most people wait until their lender sends the renewal letter to start thinking about their mortgage. That's way too late. Here's my timeline. 120 days before your maturity date: that's when you should start shopping. Most lenders will let you lock in a rate 120 days early. That gives you time to compare, negotiate, and potentially switch lenders without any penalty. If you wait until the last minute, you lose all your leverage. Set a reminder in your phone right now — 4 months before your renewal date. Or better yet, DM me your renewal date and I'll reach out when it's time.`,
    tags: ["renewal", "planning", "education"],
    sortOrder: 8,
  },
  {
    vertical: "MORTGAGE_BROKER",
    category: "myths",
    title: "You Don't Need 20% Down",
    scriptBody: `Three mortgage myths I hear every single week. Myth one: you need 20% down to buy a home. False — you can buy with as little as 5% down in Canada. Yes, you'll pay CMHC insurance, but it gets you into the market years sooner. Myth two: your bank has the best rate. Also false — mortgage brokers access 30+ lenders and frequently beat bank rates. Myth three: variable rate mortgages are always risky. Not true — historically, variable has saved borrowers money the majority of the time. Know the facts before you decide. Follow me for more.`,
    tags: ["myths", "education", "first-time"],
    sortOrder: 9,
  },
  {
    vertical: "MORTGAGE_BROKER",
    category: "myths",
    title: "Why Your Bank Isn't Giving You the Best Rate",
    scriptBody: `I need to tell you something your bank doesn't want you to know. When you walk into your bank for a mortgage, they show you THEIR rates. That's it. One lender. One set of products. A mortgage broker? I have access to over 30 lenders — big banks, credit unions, monoline lenders, alternative lenders. I shop your mortgage the way you'd shop for a car. And just like a car, the first price is almost never the best price. The best part? My service costs you nothing. The lender pays my fee. So why wouldn't you at least compare? DM me 'COMPARE' and I'll show you what you're missing.`,
    tags: ["myths", "broker-value", "education"],
    sortOrder: 10,
  },
  {
    vertical: "MORTGAGE_BROKER",
    category: "personal",
    title: "Why I Became a Mortgage Broker",
    scriptBody: `People ask me all the time why I got into mortgages. Here's the real answer. I watched someone close to me get a terrible mortgage because they didn't know they had options. They went to their bank, took the first rate offered, and overpaid by thousands over the life of their mortgage. I thought: there has to be a better way. That's what I try to be for my clients — the person who shows you ALL your options, not just the one that's most convenient for the lender. If you've ever felt confused or overwhelmed by the mortgage process, you're not alone. And I'm here to make it simple.`,
    tags: ["personal", "trust", "story"],
    sortOrder: 11,
  },
  {
    vertical: "MORTGAGE_BROKER",
    category: "personal",
    title: "What a Day in My Life Actually Looks Like",
    scriptBody: `People think mortgage brokers just process paperwork all day. Here's what my Wednesday actually looked like. 7 AM: checked overnight rate changes and prepped two pre-approval letters. 9 AM: call with a first-time buyer who was told by their bank they didn't qualify — I found them a lender in 20 minutes. 11 AM: renewal negotiation — saved a client $14,000 over 5 years. 1 PM: reviewed self-employed client's financials for an alternative lending solution. 3 PM: three status update calls on active files. 5 PM: DM from someone on Instagram asking about pre-approval — new client. That's why I do this.`,
    tags: ["personal", "day-in-life", "trust"],
    sortOrder: 12,
  },
];

const mortgageBrokerCalendar: {
  vertical: string;
  month: number;
  title: string;
  description: string;
  contentAngle: string;
  category: string;
  isRecurring: boolean;
  specificDate?: Date;
}[] = [
  // January
  {
    vertical: "MORTGAGE_BROKER",
    month: 1,
    title: "New Year Financial Reset",
    description: "Pre-approval basics, credit score improvement, new year home buying goals",
    contentAngle: "New year, new home? Start here",
    category: "first_time_buyers",
    isRecurring: true,
  },
  {
    vertical: "MORTGAGE_BROKER",
    month: 1,
    title: "Rate Outlook for the Year",
    description: "Predictions for where rates are heading, what it means for buyers",
    contentAngle: "My rate prediction for 2026",
    category: "rate_reactions",
    isRecurring: true,
  },
  // February
  {
    vertical: "MORTGAGE_BROKER",
    month: 2,
    title: "Fixed vs Variable Deep-Dive",
    description: "With spring market approaching, help buyers choose the right structure",
    contentAngle: "Fixed or variable right now? Here's my honest take",
    category: "rate_reactions",
    isRecurring: true,
  },
  {
    vertical: "MORTGAGE_BROKER",
    month: 2,
    title: "Spring Buying Prep",
    description: "Pre-approval checklist, document prep, getting mortgage-ready",
    contentAngle: "Spring market is coming — get pre-approved NOW",
    category: "first_time_buyers",
    isRecurring: true,
  },
  // March
  {
    vertical: "MORTGAGE_BROKER",
    month: 3,
    title: "BoC Rate Decision Reaction",
    description: "React to the latest Bank of Canada rate announcement",
    contentAngle: "The BoC just announced — here's what it means for your mortgage",
    category: "rate_reactions",
    isRecurring: true,
    specificDate: new Date("2026-03-12"),
  },
  {
    vertical: "MORTGAGE_BROKER",
    month: 3,
    title: "First-Time Buyer Season Kickoff",
    description: "Spring is peak first-time buyer season, address common questions",
    contentAngle: "Buying your first home this spring? Start here",
    category: "first_time_buyers",
    isRecurring: true,
  },
  // April
  {
    vertical: "MORTGAGE_BROKER",
    month: 4,
    title: "BoC Rate Decision Reaction",
    description: "April rate decision reaction and analysis",
    contentAngle: "Rate decision day — here's my breakdown",
    category: "rate_reactions",
    isRecurring: true,
    specificDate: new Date("2026-04-16"),
  },
  {
    vertical: "MORTGAGE_BROKER",
    month: 4,
    title: "Stress Test Explainer",
    description: "Most buyers don't understand the stress test — explain it simply",
    contentAngle: "How much can you ACTUALLY afford? The stress test explained",
    category: "first_time_buyers",
    isRecurring: true,
  },
  // May
  {
    vertical: "MORTGAGE_BROKER",
    month: 5,
    title: "Refinancing Check-In",
    description: "With spring in full swing, many homeowners should consider refinancing",
    contentAngle: "Should you refinance right now? 3 questions to ask yourself",
    category: "renewals",
    isRecurring: true,
  },
  // June
  {
    vertical: "MORTGAGE_BROKER",
    month: 6,
    title: "BoC Rate Decision Reaction",
    description: "Mid-year rate decision",
    contentAngle: "June rate decision — what it means for summer buyers",
    category: "rate_reactions",
    isRecurring: true,
    specificDate: new Date("2026-06-04"),
  },
  {
    vertical: "MORTGAGE_BROKER",
    month: 6,
    title: "HELOC Strategies",
    description: "Home equity lines of credit for renovations, investing, or debt consolidation",
    contentAngle: "Your home equity is a financial tool — here's how to use it",
    category: "myths",
    isRecurring: true,
  },
  // July
  {
    vertical: "MORTGAGE_BROKER",
    month: 7,
    title: "BoC Rate Decision Reaction",
    description: "Summer rate decision",
    contentAngle: "Mid-summer rate check — here's where we stand",
    category: "rate_reactions",
    isRecurring: true,
    specificDate: new Date("2026-07-16"),
  },
  {
    vertical: "MORTGAGE_BROKER",
    month: 7,
    title: "Renewal Season Alert",
    description: "Many 5-year terms from 2021 are coming up for renewal",
    contentAngle: "Your renewal is coming — DON'T just sign what they send",
    category: "renewals",
    isRecurring: true,
  },
  // August
  {
    vertical: "MORTGAGE_BROKER",
    month: 8,
    title: "Self-Employed Mortgage Guide",
    description: "Summer slowdown content — educational deep-dive for self-employed",
    contentAngle: "Self-employed? Here's how to get approved for a mortgage",
    category: "myths",
    isRecurring: true,
  },
  // September
  {
    vertical: "MORTGAGE_BROKER",
    month: 9,
    title: "BoC Rate Decision Reaction",
    description: "Fall rate decision",
    contentAngle: "September rate decision — fall market outlook",
    category: "rate_reactions",
    isRecurring: true,
    specificDate: new Date("2026-09-10"),
  },
  {
    vertical: "MORTGAGE_BROKER",
    month: 9,
    title: "Fall Market Mortgage Prep",
    description: "Fall buying season prep for buyers",
    contentAngle: "Fall market is heating up — are you mortgage-ready?",
    category: "first_time_buyers",
    isRecurring: true,
  },
  // October
  {
    vertical: "MORTGAGE_BROKER",
    month: 10,
    title: "BoC Rate Decision Reaction",
    description: "October rate decision",
    contentAngle: "Rate decision day — closing before year-end?",
    category: "rate_reactions",
    isRecurring: true,
    specificDate: new Date("2026-10-29"),
  },
  {
    vertical: "MORTGAGE_BROKER",
    month: 10,
    title: "Year-End Tax Planning & Mortgages",
    description: "How mortgage interest, HBP repayments, and year-end moves affect taxes",
    contentAngle: "Smart mortgage moves to make before December 31",
    category: "myths",
    isRecurring: true,
  },
  // November
  {
    vertical: "MORTGAGE_BROKER",
    month: 11,
    title: "Renewal Negotiation Tips",
    description: "Year-end renewal push — many terms expiring",
    contentAngle: "How I saved a client $14,000 on their renewal",
    category: "renewals",
    isRecurring: true,
  },
  // December
  {
    vertical: "MORTGAGE_BROKER",
    month: 12,
    title: "Year in Review & Predictions",
    description: "Recap the mortgage year and predict next year",
    contentAngle: "2026 mortgage year in review — and what's coming in 2027",
    category: "rate_reactions",
    isRecurring: true,
  },
  {
    vertical: "MORTGAGE_BROKER",
    month: 12,
    title: "Holiday Gratitude & Client Wins",
    description: "Personal content — thank clients, share wins from the year",
    contentAngle: "Thank you to everyone who trusted me with their biggest financial decision this year",
    category: "personal",
    isRecurring: true,
  },
];

async function main() {
  // --- Script Templates ---
  console.log("Seeding script templates...");

  await prisma.scriptTemplate.deleteMany({
    where: { vertical: "MORTGAGE_BROKER" },
  });

  const scriptRecords = mortgageBrokerScripts.map((script) => ({
    vertical: script.vertical,
    category: script.category,
    title: script.title,
    scriptBody: script.scriptBody,
    wordCount: script.scriptBody.split(/\s+/).length,
    tags: script.tags,
    sortOrder: script.sortOrder,
    isActive: true,
  }));

  const scriptResult = await prisma.scriptTemplate.createMany({ data: scriptRecords });
  console.log(`Seeded ${scriptResult.count} mortgage broker script templates.`);

  // --- Content Calendar ---
  console.log("Seeding content calendar...");

  await prisma.contentCalendar.deleteMany({
    where: { vertical: "MORTGAGE_BROKER" },
  });

  const calendarResult = await prisma.contentCalendar.createMany({
    data: mortgageBrokerCalendar,
  });
  console.log(`Seeded ${calendarResult.count} mortgage broker content calendar entries.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
