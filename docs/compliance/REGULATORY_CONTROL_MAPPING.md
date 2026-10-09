# Regulatory control mapping

Engineering reference only. No legal advice, certification, authorization or regulatory approval. Synthetic local tokens do not establish title to real assets. Sources were checked on 9 October 2026; applicability depends on the instrument, service, entity and jurisdiction, and counsel must assess the current consolidated law.

## MiCA

**Context:** MiCA excludes crypto-assets that qualify as financial instruments. Tokenization does not itself move a security into MiCA. This bond should be assessed under securities legislation, not assumed to be a MiCA asset. [ESMA, MiCA Article 2](https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mica/article-2-scope).

**Potential obligations:** classification, issuer/service authorization and disclosures if a particular asset or service falls within scope. **Implemented:** identity gating, audit events and clear mock-payment labeling. **Organizational processes:** classification review, licensing and disclosure governance. **External dependencies:** competent authorities, counsel and authorized service providers. **Unimplemented:** white-paper workflows, reserve safeguards and regulated custody. **Legal interpretation:** assess each instrument and payment arrangement separately; mockEUR is a simulation, not an e-money token issuance.

## MiFID II

**Context:** investment-service and financial-instrument rules may apply to tokenized securities. **Potential obligations:** authorization, investor protection, product governance, appropriateness/suitability and recordkeeping depending on activity. [Directive 2014/65/EU](https://eur-lex.europa.eu/eli/dir/2014/65/oj/eng).

**Implemented:** issuer roles, bounded issuance, configurable holding/jurisdiction controls and transaction records. **Organizational processes:** client classification, suitability decisions, conflicts management and product approval. **External dependencies:** licensed intermediaries, counsel and investor records. **Unimplemented:** suitability assessments, best execution, transaction reporting and venue authorization. **Legal interpretation:** an on-chain eligibility flag is not a MiFID client classification or suitability assessment.

## CSDR

**Context:** EU securities settlement and central securities depository activities have specific requirements. **Potential obligations:** settlement discipline, issue integrity, operational controls and reporting where applicable. [Regulation 909/2014](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=celex%3A32014R0909), [ESMA reporting context](https://www.esma.europa.eu/data-reporting/csdr-reporting).

**Implemented:** same-chain atomic DvP, issuance cap and event/balance reconciliation. **Organizational processes:** settlement-failure management, record reconciliation, legal finality and participant oversight. **External dependencies:** authorized infrastructures and legally effective cash/security arrangements. **Unimplemented:** CSD authorization, settlement-discipline reporting and real cash finality. **Legal interpretation:** transaction atomicity and two-block confirmation do not establish settlement finality under law.

## DORA

**Context:** digital operational resilience rules apply to covered financial entities. **Potential obligations:** ICT risk management, incident handling/reporting, testing and third-party oversight. [Regulation 2022/2554](https://eur-lex.europa.eu/eli/reg/2022/2554/oj), [Commission implementation resources](https://finance.ec.europa.eu/regulation-and-supervision/financial-services-legislation/implementing-and-delegated-acts/digital-operational-resilience-regulation_en).

**Implemented:** threat model, least-privilege roles, dependency locks, automated tests, pause controls and reorg recovery. **Organizational processes:** incident response, recovery exercises, asset inventories and vendor reviews. **External dependencies:** secure hosting, custodians and monitoring providers. **Unimplemented:** operational SLAs, regulatory incident submissions, independent resilience tests and production recovery validation. **Legal interpretation:** repository controls alone do not demonstrate DORA compliance.

## AML/KYC and investor eligibility

**Context:** identity and financial-crime obligations depend on the obliged entity and applicable national/EU framework, including the transition to the 2024 AML package. [European Commission AML/CFT overview](https://finance.ec.europa.eu/financial-crime/anti-money-laundering-and-countering-financing-terrorism-eu-level_en), [Council adoption notice](https://www.consilium.europa.eu/en/press/press-releases/2024/05/30/anti-money-laundering-council-adopts-package-of-rules/).

**Potential obligations:** customer and beneficial-owner identification, risk assessment, ongoing monitoring and reporting where applicable. **Implemented:** trusted synthetic attestations, claim topics, expiry/revocation, jurisdiction and freezing. **Organizational processes:** document verification, sanctions screening, risk assessment and investigations. **External dependencies:** identity providers, sanctions data and competent authorities. **Unimplemented:** real KYC, beneficial-owner checks, transaction monitoring and suspicious-activity reporting. **Legal interpretation:** hashes and wallet flags are not verified identity; country gating is not a sanctions program.

## Recordkeeping, auditability and governance

**Context:** these responsibilities recur across regimes and entity types. **Potential obligations:** accurate, retrievable records, controlled access, retention and accountable governance. **Implemented:** canonical event storage, transaction status, preparation audit, source-tagged metrics and separate initial roles. **Organizational processes:** retention schedules, access reviews, four-eyes approvals, privacy policies and audit response. **External dependencies:** protected backups, identity controls and legal retention advice. **Unimplemented:** tamper-evident off-chain audit storage, production IAM, archival SLAs and multisig/timelock deployment. **Legal interpretation:** public-chain observability is not an adequate regulated recordkeeping policy by itself.
