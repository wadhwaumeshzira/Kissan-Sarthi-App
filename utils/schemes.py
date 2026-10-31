# Major central government schemes for farmers. Given to Gemini as grounding so it does not invent
# schemes or websites. Amounts change over time — the prompt asks it to tell farmers to verify.
CENTRAL_SCHEMES = """
1. PM-KISAN (Pradhan Mantri Kisan Samman Nidhi) — Income support of Rs 6,000 per year in 3 instalments to landholding farmer families. Excludes income-tax payers, government employees and certain professionals. Needs Aadhaar, land records, bank account, e-KYC. Website: https://pmkisan.gov.in
2. PMFBY (Pradhan Mantri Fasal Bima Yojana) — Crop insurance against natural calamities, pests and diseases. Low farmer premium (about 2% Kharif, 1.5% Rabi, 5% commercial/horticulture crops). Apply via bank, CSC or portal before the cut-off date each season. Website: https://pmfby.gov.in
3. Kisan Credit Card (KCC) — Short-term crop loans at concessional interest with interest subvention and extra incentive for timely repayment. Also available for animal husbandry and fisheries. Apply at any bank branch with land records and ID.
4. Soil Health Card Scheme — Free soil testing with a card giving nutrient status and fertilizer recommendations. Contact the local agriculture office / soil testing lab. Website: https://soilhealth.dac.gov.in
5. PMKSY – Per Drop More Crop (Pradhan Mantri Krishi Sinchayee Yojana) — Subsidy on drip and sprinkler micro-irrigation, higher for small and marginal farmers. Apply via state agriculture/horticulture department. Website: https://pmksy.gov.in
6. PM-KUSUM — Subsidy on standalone solar irrigation pumps and solarising grid-connected pumps (central + state subsidy, farmer pays the remaining share, bank loan possible). Apply via state nodal agency. Website: https://pmkusum.mnre.gov.in
7. SMAM (Sub-Mission on Agricultural Mechanization) — Subsidy on farm machinery (tractors, power tillers, seed drills, etc.), higher for small/marginal, SC/ST and women farmers; also Custom Hiring Centres. Website: https://agrimachinery.nic.in
8. PKVY (Paramparagat Krishi Vikas Yojana) — Financial support to farmer groups/clusters for adopting organic farming, certification and marketing. Apply via state agriculture department.
9. e-NAM (National Agriculture Market) — Online trading platform connecting mandis so farmers can get better prices. Register through the local APMC mandi. Website: https://www.enam.gov.in
10. PM-KMY (Pradhan Mantri Kisan Maandhan Yojana) — Voluntary pension of Rs 3,000 per month after age 60 for small and marginal farmers who join between ages 18 and 40 with a small monthly contribution. Enrol at a CSC. Website: https://maandhan.in
11. Agriculture Infrastructure Fund (AIF) — Loans with interest subvention and credit guarantee for post-harvest infrastructure like warehouses, cold storage and processing units. Website: https://agriinfra.dac.gov.in
12. MIDH (Mission for Integrated Development of Horticulture) — Assistance for fruits, vegetables, flowers, polyhouses, nurseries and post-harvest management. Apply via state horticulture department. Website: https://midh.gov.in

Helpful contacts: Kisan Call Centre 1800-180-1551 (free), myScheme portal https://www.myscheme.gov.in to check eligibility for all government schemes.
"""

SCHEME_NEEDS = (
    "Income support", "Crop insurance", "Loan / credit", "Irrigation", "Solar pump",
    "Machinery / equipment", "Organic farming", "Soil testing", "Selling crops / market",
    "Pension", "Horticulture", "Storage / warehouse",
)
