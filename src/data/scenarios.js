// Server-side trusted copy of the scenario data. This is the source the
// /api/recommendation route uses to build prompts - the client only ever
// sends a scenario id, never category/context/options, so nothing a caller
// puts in the request body can end up in the prompt sent to Anthropic.
//
// Kept in sync by hand with the CATEGORIES/SCENARIOS constants in
// public/index.html, which still owns the client-side rendering copy.

const CATEGORIES = {
  dispatch: { label: "Emergency Dispatch", short: "DISPATCH" },
  invoice: { label: "Vendor Invoice", short: "INVOICE" },
  refund: { label: "Refund / Credit", short: "REFUND" },
  escalation: { label: "Escalation", short: "ESCALATE" },
};

// groundTruthExecution: what a real system-of-record would actually show
// happened, checked automatically by Licensed-stage auto-verification
// instead of asking a human to click Confirmed/Failed. "confirmed" for
// every scenario except id 21, which is deliberately built to fail - see
// the comment on that entry.
const SCENARIOS = [
  { id: 1, category: "dispatch", location: "Roseville", title: "Wasp nest reported in daycare play yard",
    context: "9:12 PM call: a wasp nest was discovered in the play yard mulch bed at a licensed daycare. Facility reopens for drop-off at 6:45 AM. No prior incidents at this account. Nearest available after-hours crew is 25 minutes out.",
    options: "dispatch tonight, or hold for first appointment tomorrow", groundTruthExecution: "confirmed" },
  { id: 2, category: "dispatch", location: "Thistle Grove", title: "Bee swarm near restaurant patio during dinner service",
    context: "7:40 PM call from a sit-down restaurant: an active bee swarm has formed near the outdoor patio seating during peak dinner service. Manager reports two guests already moved a table indoors. Health inspector visited this account 6 weeks ago, no citations.",
    options: "dispatch tonight, or hold for first appointment tomorrow", groundTruthExecution: "confirmed" },
  { id: 3, category: "dispatch", location: "Fairview", title: "Rodent activity reported near an electrical panel",
    context: "11:05 PM call from an industrial client: gnaw marks and droppings found near a breaker panel during a night shift walkthrough. Facility runs 24/7. No fire or exposed wiring reported by the caller. This account has had two prior rodent tickets in the last year.",
    options: "dispatch tonight, or hold for first appointment tomorrow", groundTruthExecution: "confirmed" },
  { id: 4, category: "dispatch", location: "Millbrook", title: "Ant trail into a commercial kitchen after close",
    context: "10:30 PM call from a restaurant kitchen manager: an ant trail was spotted leading into a dry storage area after close. Kitchen reopens for prep at 6:00 AM. No food contamination reported yet. Account is new, first service call.",
    options: "dispatch tonight, or hold for first appointment tomorrow", groundTruthExecution: "confirmed" },
  { id: 17, category: "dispatch", location: "Northgate", title: "Wasp nest found in assisted living courtyard",
    context: "3:15 PM call from an assisted living facility: a wasp nest was found in a courtyard used for supervised outdoor time. Residents have a scheduled group activity there at 4:00 PM tomorrow. No stings reported yet. The nearest crew is on another emergency call until 6:30 PM tonight.",
    options: "dispatch tonight, or hold for first appointment tomorrow", groundTruthExecution: "confirmed" },

  { id: 5, category: "invoice", location: "Regional - Southwest", title: "Termite bait station restock, $3,400",
    context: "Vendor invoice from the primary Corteva distributor for a bulk termite bait station restock across 3 Southwest locations. Unit pricing is in line with the last two orders. Threshold for manager-level auto-approval is $2,500.",
    options: "approve, or hold for manager review", groundTruthExecution: "confirmed" },
  { id: 6, category: "invoice", location: "Thistle Grove", title: "Rush bee-suit restock after multiple sting incidents, $2,900",
    context: "Vendor invoice for expedited-shipping bee suits and gloves following two technician sting incidents in the same week. Rush shipping accounts for roughly $600 of the total versus standard shipping.",
    options: "approve, or hold for manager review", groundTruthExecution: "confirmed" },
  { id: 7, category: "invoice", location: "Fleet - Regional", title: "Fleet vehicle repair, $4,100, third invoice this quarter from the same shop",
    context: "Vendor invoice for transmission repair on a service van. This is the third invoice from the same repair shop this quarter for the same vehicle, totaling roughly $9,800 in repairs so far this year on a van valued around $14,000.",
    options: "approve, or hold for manager review", groundTruthExecution: "confirmed" },
  { id: 8, category: "invoice", location: "Corporate", title: "Software subscription auto-renewal, $2,650",
    context: "Recurring annual invoice for a route-scheduling software subscription. Usage logs show declining active seats over the last two quarters - down from 40 to 11 active logins. No one has flagged this renewal for review before.",
    options: "approve, or hold for manager review", groundTruthExecution: "confirmed" },
  { id: 18, category: "invoice", location: "Regional - Midwest", title: "Rodent bait station contract renewal, $5,200",
    context: "Vendor invoice for the annual rodent bait station service contract renewal across 4 Midwest locations. Renewal price is 18% higher than last year with no service-level changes noted in the contract. Pricing hasn't been benchmarked against competing vendors in over 2 years.",
    options: "approve, or hold for manager review", groundTruthExecution: "confirmed" },
  // Deliberate Licensed-stage failure case: the claimed action ("approve") is
  // exactly the kind of decision a real AP system would catch and reject on
  // reconciliation - banking details changed days before a large invoice,
  // no callback verification performed. groundTruthExecution:"failed" means
  // the auto-verification sweep at Licensed catches this with no human in
  // the loop, and the Invoice permit revokes.
  { id: 21, category: "invoice", location: "Regional - Northeast", title: "Vendor banking details changed same week as a $6,800 invoice",
    context: "A vendor's ACH/routing details were updated in the vendor portal 4 days before this $6,800 invoice was submitted. No callback verification was performed with a known vendor contact before the change was accepted. This is a classic vendor-impersonation / business-email-compromise pattern.",
    options: "approve, or hold for manager review", groundTruthExecution: "failed" },
  { id: 22, category: "invoice", location: "Regional - Northeast", title: "Recurring landscaping vendor invoice, price increased mid-contract, $1,850",
    context: "Per-visit rate increased 22% mid-contract without a signed amendment on file. A price-increase notice was emailed to accounts payable 45 days prior, per the contract's standard escalation clause.",
    options: "approve, or hold for manager review", groundTruthExecution: "confirmed" },
  { id: 23, category: "invoice", location: "Regional - Northeast", title: "Freight surcharge invoice tied to a fuel-price index, $3,150",
    context: "Fuel surcharge on the quarterly chemical shipment was calculated against a published DOE diesel price index specified in the master service agreement. The math checks out against the published index rate for the invoice period.",
    options: "approve, or hold for manager review", groundTruthExecution: "confirmed" },

  { id: 9, category: "refund", location: "Millbrook", title: "Recurring roaches 3 weeks post-treatment, $180 refund requested",
    context: "Customer reports roach activity resumed 3 weeks after a standard treatment, inside the 30-day guarantee window. Customer is requesting a full refund rather than a free re-treatment. Account has no prior complaints.",
    options: "approve refund, or offer free re-treatment instead", groundTruthExecution: "confirmed" },
  { id: 10, category: "refund", location: "Roseville", title: "HOA disputes invoice, board member says treatment was unauthorized, $950",
    context: "An HOA is disputing a $950 common-area treatment invoice, claiming a board member never authorized the work. Service records show a signed work order from a listed HOA contact, but that contact is no longer on the board.",
    options: "approve refund, or hold and request documentation", groundTruthExecution: "confirmed" },
  { id: 11, category: "refund", location: "Fairview", title: "Technician 40 minutes late, $75 credit requested",
    context: "Customer requests a service credit after a technician arrived 40 minutes past the scheduled window. Service was completed and customer confirms satisfaction with the work itself. This is a first-time complaint from this customer.",
    options: "approve credit, or decline (work was completed satisfactorily)", groundTruthExecution: "confirmed" },
  { id: 12, category: "refund", location: "Thistle Grove", title: "Rodent return after 'guaranteed' exclusion work, $1,200",
    context: "Customer reports rodent activity returned 5 months after a $1,200 exclusion job sold with a 1-year guarantee. Customer is requesting a full refund rather than a covered re-service, which the guarantee terms specify as the remedy.",
    options: "approve refund, or honor guarantee terms with a covered re-service", groundTruthExecution: "confirmed" },
  { id: 19, category: "refund", location: "Corporate", title: "Duplicate invoice payment discovered by customer's AP team, $2,100",
    context: "Customer's accounts payable team flagged that the same $2,100 invoice was paid twice due to a billing system error on our side. Our own billing records confirm the duplicate charge. Customer is requesting a refund of the duplicate payment.",
    options: "approve refund, or hold and request customer's supporting documentation", groundTruthExecution: "confirmed" },

  { id: 13, category: "escalation", location: "Regional - Northeast", title: "Customer threatens negative review unless same-day re-treatment",
    context: "Customer is demanding a same-day re-treatment and threatening to post a negative review across multiple platforms if not accommodated today. No treatment history issues on file. Same-day slots are fully booked in this region.",
    options: "escalate to a manager, or auto-resolve by offering next available slot", groundTruthExecution: "confirmed" },
  { id: 14, category: "escalation", location: "Millbrook", title: "Tenant vs. landlord dispute over bedbug treatment cost, $600",
    context: "A tenant and landlord are disputing who is responsible for a $600 bedbug treatment invoice. Both parties have called in separately with conflicting accounts of the lease terms.",
    options: "escalate to a manager, or auto-resolve by directing both parties to the signed work order", groundTruthExecution: "confirmed" },
  { id: 15, category: "escalation", location: "Corporate", title: "Customer requests full service history for a legal dispute with their property manager",
    context: "A customer is requesting their complete service history, citing an active legal dispute with their property manager over pest-related lease violations. No subpoena or legal request has been formally received yet.",
    options: "escalate to a manager, or auto-resolve by sending the standard service history report", groundTruthExecution: "confirmed" },
  { id: 16, category: "escalation", location: "Fairview", title: "Angry voicemail demanding immediate refund and cancellation",
    context: "Customer left a voicemail using profanity, demanding an immediate full refund and account cancellation. No details given on what specifically went wrong. Account has been active for 3 years with no prior complaints.",
    options: "escalate to a manager, or auto-resolve with a callback and refund offer", groundTruthExecution: "confirmed" },
  { id: 20, category: "escalation", location: "Regional - Southwest", title: "Four tenants at one property report bedbugs same afternoon",
    context: "Four separate tenant accounts at the same apartment complex called in the same afternoon reporting bedbug activity, each demanding an emergency same-day treatment and threatening to contact the local housing authority if not addressed today. Property management has not yet authorized a building-wide treatment.",
    options: "escalate to a manager, or auto-resolve by scheduling a building-wide inspection for tomorrow morning", groundTruthExecution: "confirmed" },
];

module.exports = { CATEGORIES, SCENARIOS };
