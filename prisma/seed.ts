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

async function main() {
  console.log("Seeding script templates...");

  // Delete existing mortgage broker templates and re-insert (idempotent)
  await prisma.scriptTemplate.deleteMany({
    where: { vertical: "MORTGAGE_BROKER" },
  });

  const records = mortgageBrokerScripts.map((script) => ({
    vertical: script.vertical,
    category: script.category,
    title: script.title,
    scriptBody: script.scriptBody,
    wordCount: script.scriptBody.split(/\s+/).length,
    tags: script.tags,
    sortOrder: script.sortOrder,
    isActive: true,
  }));

  const result = await prisma.scriptTemplate.createMany({ data: records });
  console.log(`Seeded ${result.count} mortgage broker script templates.`);
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
