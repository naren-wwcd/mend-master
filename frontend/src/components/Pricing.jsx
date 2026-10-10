import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import Reveal from "./Reveal.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

const BILLING = [
  ["monthly", "Monthly"],
  ["yearly", "Yearly"],
];

// Placeholder plans and prices. Ids match PLANS in auth/store.js.
const PLANS = [
  {
    id: "starter",
    name: "Starter",
    blurb: "For trying Mend on a single sandbox.",
    monthly: 0,
    yearly: 0,
    cta: "Start free",
    features: [
      "1 sandbox environment",
      "3 seeded fault scenarios",
      "Replay-mode agent",
      "7-day audit log",
      "Community support",
    ],
  },
  {
    id: "team",
    name: "Team",
    blurb: "For on-call teams that want guarded auto-fixes.",
    monthly: 49,
    yearly: 39,
    cta: "Start with Team",
    featured: true,
    features: [
      "10 environments",
      "Full fix catalog",
      "Human approval workflow",
      "Legacy portal automation",
      "90-day audit and access logs",
      "Email support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    blurb: "For organisations with their own controls.",
    monthly: null,
    yearly: null,
    cta: "Choose Enterprise",
    features: [
      "Unlimited environments",
      "Custom fix catalog",
      "Role-based approvals",
      "Unlimited log retention",
      "Dedicated support",
    ],
  },
];

function RollingPrice({ value }) {
  return (
    <span className="price-roll">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: "70%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-70%", opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function caption(plan, billing) {
  if (plan.monthly === null) return "tailored to your estate";
  if (plan.monthly === 0) return "free, no card needed";
  return billing === "yearly" ? "per month, billed yearly" : "per month";
}

export default function Pricing() {
  const { session } = useAuth();
  const [billing, setBilling] = useState("monthly");
  const tabRefs = useRef({});

  const onKey = (event) => {
    const index = BILLING.findIndex(([id]) => id === billing);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % BILLING.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + BILLING.length) % BILLING.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = BILLING.length - 1;
    else return;
    event.preventDefault();
    const id = BILLING[next][0];
    setBilling(id);
    tabRefs.current[id]?.focus();
  };

  return (
    <section id="pricing" className="section pricing">
      <Reveal className="section-head">
        <p className="eyebrow">Pricing</p>
        <h2 className="display">Pay for the <span className="hl">sleep</span> you get back</h2>
        <div className="tabs pricing-tabs" role="tablist" aria-label="Billing period" onKeyDown={onKey}>
          {BILLING.map(([id, label]) => (
            <button
              key={id}
              ref={(node) => { tabRefs.current[id] = node; }}
              type="button"
              role="tab"
              id={`billing-${id}`}
              aria-selected={billing === id}
              aria-controls="pricing-plans"
              tabIndex={billing === id ? 0 : -1}
              className="tab"
              onClick={() => setBilling(id)}
            >
              {billing === id && (
                <motion.span
                  layoutId="billing-pill"
                  className="tab-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              {label}
              {id === "yearly" && <span className="save-tag">Save 20%</span>}
            </button>
          ))}
        </div>
      </Reveal>

      <div id="pricing-plans" className="plans" role="tabpanel" aria-labelledby={`billing-${billing}`}>
        {PLANS.map((plan, index) => {
          const amount = plan[billing];
          return (
            <Reveal
              as="article"
              key={plan.id}
              delay={index * 0.08}
              className={`plan ${plan.featured ? "featured" : ""}`}
            >
              {plan.featured && <span className="plan-tag">Most popular</span>}
              <h3>{plan.name}</h3>
              <p className="plan-blurb">{plan.blurb}</p>
              <p className="plan-price">
                <RollingPrice value={amount === null ? "Custom" : `$${amount}`} />
              </p>
              <p className="plan-caption">{caption(plan, billing)}</p>
              <Link
                to={session ? "/app" : `/login?mode=signup&plan=${plan.id}`}
                className={`btn btn-block ${plan.featured ? "btn-primary" : ""}`}
              >
                {session ? "Open console" : plan.cta} <span className="arrow" aria-hidden="true">→</span>
              </Link>
              <ul>
                {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
            </Reveal>
          );
        })}
      </div>
      <p className="pricing-note">Demo pricing. Plans and prices are placeholders.</p>
    </section>
  );
}
