/**
 * Public emergency numbers published by the Municipality of Gumaca
 * (gumaca.gov.ph emergency hotlines / helpdesk).
 */
export const NATIONAL_EMERGENCY = "911";

export const GUMACA_HOTLINES = {
  mdrrmo: {
    name: "MDRRMO Gumaca (KALASAG)",
    type: "Primary Command",
    mobile: "09463333911",
    landline: "0423177833",
  },
  pnp: {
    name: "Gumaca PNP",
    type: "Law & Order",
    mobile: "09988568352",
    landline: "0423177700",
  },
  bfp: {
    name: "Gumaca Fire Station (BFP)",
    type: "Fire Rescue",
    mobile: "09178616285",
    landline: "0423176210",
  },
  helpdesk: {
    name: "Municipal Helpdesk / Health",
    type: "Medical Response",
    mobile: "09177773769",
    landline: "",
  },
} as const;

export const PRIMARY_MDRRMO_TEL = `tel:${GUMACA_HOTLINES.mdrrmo.mobile}`;
