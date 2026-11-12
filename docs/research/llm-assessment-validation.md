# Evidence and validation plan for LLM assessment

Research checked 2026-10-30. This is a research and implementation proposal, not a validation report. It concerns formative feedback on a submitted response, not intelligence, diagnosis, certification, or a person's general reasoning ability. See also [argumentation evidence](argumentation-evidence.md) for the construct and rubric literature.

## Conclusion

An established human rubric does **not** make a new LLM scorer scientifically validated. The task, response format, population, language, reference material, scoring process, model, and intended use all matter. Published results range from useful agreement on constrained short answers to substantial disagreement and subgroup differences on essays. The defensible product claim today is **research-informed, provisional coaching**. Accurate task-specific scoring is an empirical target, not an attribute conferred by a prompt.

Three questions require different studies:

1. Does the rubric represent the intended aspects of the response?
2. Does this particular scoring pipeline apply that rubric accurately, consistently, and fairly in the intended setting?
3. Does using the feedback improve performance on new tasks?

A strong answer to one does not establish the others. A schema-valid answer, a relevant-looking quotation, a high correlation, a reassuring explanation, or an offline mocked API test does not answer all three.

## What the assessment standards require

The [AERA/APA/NCME *Standards for Educational and Psychological Testing* (2014)](https://www.testingstandards.net/uploads/7/6/6/4/76643089/standards_2014edition.pdf), Standards 1.0–1.4, attach validity evidence to specified interpretations, uses, and populations. Standards 2.0–2.4 require appropriate precision evidence, including for subscores and interpreted differences. Standard 2.7 distinguishes rater agreement from reliability across other sources of variation. Standards 4.18–4.20 address scoring rules, examples, training, and empirical support for automated scoring, including agreement and bias. These are professional standards, not certification of an app or a universal numerical cutoff. **Implication for this app:** changing from trained humans to an LLM, adapting a rubric to brief speech, or claiming longitudinal improvement requires additional evidence.

[Williamson, Xi, and Breyer (2012), *A Framework for Evaluation and Use of Automated Scoring*](https://doi.org/10.1111/j.1745-3992.2011.00223.x), is a peer-reviewed assessment framework; [ETS provides the publication record](https://www.ets.org/research/policy_research_reports/publications/article/2012/jely.html). It considers alignment with assessment purpose, empirical performance, generalization, consequences, and operational maintenance. It predates current LLMs. Its useful contribution is the evaluation structure, not permission to transplant historical automated-essay thresholds into a different app.

[ETS *Best Practices for Constructed-Response Scoring*, 2021 manual](https://www.ets.org/content/dam/ets-org/pdfs/about/cr_best_practices.pdf), also published as a [2022 research report](https://www.ets.org/research/policy_research_reports/publications/report/2022/kgpl.html), recommends representative, independent development/evaluation samples (§5.4.1), sound human criterion scores (§5.4.2), multiple agreement and distribution measures (§5.4.4), subgroup evaluation (§5.4.5), and monitoring (§5.5). The manual discusses score compression and sample-size limits. **Implication:** retain raw independent ratings, keep the final test set separate from prompt development, inspect systematic errors, and make uncertainty visible. Matching a consensus score does not make the consensus infallible.

## Primary empirical evidence

These results are not directly comparable: scales, tasks, models, prompts, and human references differ. Reported historical model names must not be treated as evidence for a newer model alias.

| Study and publication status | Setting and result | What it establishes—and does not |
| --- | --- | --- |
| [Henkel et al. (2024), ACM Learning @ Scale](https://doi.org/10.1145/3657604.3664693); [author manuscript](https://arxiv.org/abs/2405.02985). Peer-reviewed conference paper, manuscript hosted on arXiv. | 1,710 science/history responses to 12 K–12 questions, binary correct/incorrect scoring; 38 teacher raters. Human–human Cohen κ was .75; GPT-4 few-shot κ was .70, versus .68 zero-shot. Human reference used two ratings and a third tie-breaker. | Constrained scoring with exemplars can approach human agreement in a specific setting. Binary answer correctness is not a four-level measure of everyday argument quality. Blank/exact-exemplar response exclusions also limit transfer. |
| [Jiang and Bosch (2024), ACM Learning @ Scale](https://doi.org/10.1145/3657604.3664685); [author PDF, Tables 1–3](https://pnigel.com/papers/jiang-2024-2TEQ5JEF.pdf). Peer-reviewed. | `gpt-4-1106-preview`, temperature 0, ASAP short answers across 10 questions. Mean quadratic weighted κ (QWK) increased from .610 to .677 with scoring examples. Subject results with examples included English .579 and biology .786. Score-only QWK was .611; rationale-then-score in one query was .573. | Task-specific examples and subject matter mattered; requesting more reasoning did not reliably improve scores. An articulate rationale is not evidence of a correct grade. The reported numbers are this experiment's results, not general GPT-4 accuracy. |
| [Johnson and Zhang (2024), *Scientific Reports* 14:30064](https://doi.org/10.1038/s41598-024-79208-2); [full paper and tables](https://pmc.ncbi.nlm.nih.gov/articles/PMC11614890/). Peer-reviewed. | GPT-4o zero-shot holistic scoring, 13,121 PERSUADE 2.0 essays, eight prompts, grades 8–12, 1–6 scale. Exact agreement was about 30%; within-one about 77%; QWK .437 (95% CI .387–.487). AI scores averaged .90 points below human scores. The adjusted Asian/Pacific Islander group difference was −1.16, versus overall −.90. | A rubric alone did not produce adequate agreement in this setting; conditional subgroup discrepancies require investigation. This is not proof that every model/prompt is inaccurate. The study does not justify inferring demographics in this app or treating subgroup differences as a causal estimate. |
| [Yancey et al. (2023), BEA workshop](https://aclanthology.org/2023.bea-1.49/). Peer-reviewed conference workshop. | GPT-3.5/GPT-4 CEFR scoring of short L2 essays. Calibration examples improved GPT-4 agreement; performance varied by first-language group. The authors compared with an established automated writing evaluator. | Relevant evidence for language assessment under specified conditions. CEFR measures and short-essay results do not validate argumentation scores. No numerical estimate is imported here from an unverified table. |
| [Zheng et al. (2023), NeurIPS Datasets and Benchmarks](https://papers.neurips.cc/paper_files/paper/2023/hash/91f18a1287b398d378ef22505bf41832-Abstract-Datasets_and_Benchmarks.html). Peer-reviewed. | Strong judges, including GPT-4, exceeded 80% agreement with human preferences in MT-Bench/Chatbot Arena evaluations. The paper identifies position, verbosity, and self-enhancement biases and reasoning limits. | This measures preferences between assistant outputs, not the accuracy of student grades or a validated measure of reasoning ability. The “80%” cannot be used as this app's expected accuracy. |
| [Calderon, Reichart, and Dror (2025), ACL](https://aclanthology.org/2025.acl-long.782/). Peer-reviewed. | Alternative Annotator Test: six LLMs, four prompting methods, ten datasets; at least one configuration passed their statistical comparison in nine datasets. It compares an alternative annotator with a group rather than treating one human as unquestionable truth. | A useful additional method when enough independent human annotations exist. A statistical replacement decision still depends on the selected tasks, annotators, losses, and decision criteria; it does not establish construct validity or universal equivalence. |
| [Raina, Liusie, and Gales (2024), EMNLP](https://aclanthology.org/2024.emnlp-main.427/). Peer-reviewed. | Short adversarial additions could inflate zero-shot judge scores and transfer across models; absolute assessment was more vulnerable than comparative assessment in their experiments. | User responses must be treated as untrusted data. Include prompt-injection and score-manipulation tests; delimiters and schema enforcement alone are insufficient evidence of robustness. |

The apparent conflict between the short-answer and essay findings is informative: **the assessment setup is part of the system being validated**. There is no defensible pooled “LLM grading accuracy” percentage for these different uses.

Two additional methodological sources are useful:

- [Koo and Li (2016)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4913118/) distinguish ICC forms by model, single/average measurement, and absolute agreement/consistency. Correlation can remain high despite a systematic offset. For ordinal four-level criteria, prioritize ordinal agreement and direct errors; use ICC only with a justified interval interpretation, the appropriate form, and a confidence interval. Do not reuse generic ICC adjectives as product release rules.
- [Tian et al. (2023), EMNLP](https://aclanthology.org/2023.emnlp-main.330/) study elicited confidence on factual QA benchmarks. That does not calibrate confidence on argument ratings. A model's “high confidence” is not an estimated probability of being correct here. Calibration requires observed outcomes on suitable held-out data.

## Recommended scoring design

The following is a proposed MindGarden design, not a claim that the cited studies validated this pipeline.

**Define the performance being judged.** Keep original, mode-specific analytic criteria, with task-specific examples of acceptable evidence and different defensible answers. Distinguish support quality, inference, clarity, and relevant alternatives. Assess only what the prompt reasonably elicits. Short responses need not contain an essay's components; mere brevity or disagreement with the coach must not lower scores. A genuinely inapplicable criterion uses `null` with a reason, not a fabricated low score. No text-only delivery rating.

**Preserve the evaluation context.** Freeze the prompt, mode, debate turns, corrected transcript, reference/source snapshot and hashes. A supplied news summary is not the complete source and does not prove arbitrary real-world claims. When relevant evidence is unavailable, say so. Check against supplied reference material separately from evaluating how the response reasons; “not established here” and “false” are different findings.

**Use rubric anchors and evidence.** Give the model behaviorally specific levels, human-reviewed boundary examples, and negative examples such as fluent but unsupported reasoning. Have it return criterion decisions, concise justification, exact answer spans, applicability/uncertainty reasons, and one usable next step. Do not require hidden chain-of-thought or count transitions as a reasoning score. Test any multi-stage or second-review design against a simpler baseline; an ensemble is an experimental condition, not a validity guarantee.

**Validate the output deterministically.** Enforce schema, score range, allowed criteria, exact offsets/quotes, and context limits. Reject invented or altered quotes. Separately evaluate whether real quoted text actually supports the claimed strength/problem: substring matching verifies existence, not interpretation. A second model checking the first is not an independent human reference.

**Treat answers as data.** Do not follow instructions inside a response, retrieve URLs supplied as evaluator commands, or let the answer alter the rubric. Exercise adversarial, irrelevant, copied, contradictory, and source-fabricating responses. Audit unjustified rewards for length, polished wording, confidence, evaluator agreement, and lists of citations.

**Separate coaching from measurement.** Until a particular configuration has adequate evidence, present qualitative feedback with provisional labels, no global ability score, percentile, or validated-growth claim. Exact-score comparisons require compatible task/context and version metadata; even then, task difficulty and measurement error can explain differences. A few chart points do not establish skill growth. Reward participation and revision rather than score maximization.

**Version the whole procedure.** Persist provider/model identifier, model snapshot where available, request parameters, rubric version, prompt-template version, input/source hashes, and scoring-code version. Keep calibration study scope and results in a reviewed artifact, separate from configuration. A new model, rubric, or template needs regression evaluation; do not silently inherit old evidence. Use shadow comparisons and rollback before broadening the supported scope.

## Proposed validation study

### Scope and sampling

Start narrowly: English-language, adult, voluntary formative practice; the actual spin/speak, reading/reflection, and solo-debate tasks; corrected text or user-approved transcripts. Do not extrapolate to minors, other languages, uncorrected ASR, admissions, or clinical use. Evaluate each mode and criterion separately before enabling its quantitative interpretation.

As a **planning estimate**, first collect 60 pilot responses to refine instructions and rater training, then approximately 900 distinct responses: 450 development and 450 locked evaluation, balanced across the three modes. This is a budget starting point, not a statistically sufficient universal sample size. Use pilot distributions, clustering, desired interval widths, error prevalence, and planned subgroup analyses to calculate the final sample. If a criterion or subgroup is sparse, collect more data or leave that conclusion unsupported.

Use authentic responses, diverse quality levels, and actual expected task lengths. Split participants and prompt families between development and final evaluation, and include unseen prompts. Do not let a participant's retry appear across both splits. Reference context must be available to both humans and models. Artificial adversarial and invariant pairs form a separately labeled challenge set; they do not replace a representative population sample. Do not construct the main gold standard from LLM-generated responses rated by another LLM.

### Human reference and independence

Recruit trained domain-appropriate raters. Prefer three independent ratings per final response; retain every original score, applicability decision, and rationale. Raters should be blind to model output and irrelevant identity information. Randomize response order and monitor drift. Write the adjudication procedure in advance, then record adjudicated reference scores separately; never replace the raw ratings with consensus and report the result as independent agreement.

Report raw pairwise human agreement and all-rater evidence before judging the model. Low human agreement may mean the rubric, task, or training needs revision. To compare model error against a “human baseline,” avoid comparing a human with an adjudicated score that already includes that human's vote. Use an independently rated reference panel or an explicitly described leave-one-rater-out procedure, with its limitations. Two ratings and a tie-breaker do not by themselves support a clean human-equivalence claim.

### Evaluation and uncertainty

| Question | Report |
| --- | --- |
| Does the model match the reference? | Per mode × criterion: sample counts, fixed-scale QWK, exact agreement, within-one agreement, MAE, signed error, ≥2-level error rate, and full confusion matrix. |
| Is the human reference reproducible? | Independent human-pair QWK/direct errors and applicability agreement, separate from model-versus-adjudicated-reference results. An all-rater ordinal method can supplement pairwise results. |
| How much does the scorer decline to judge? | Eligible-reference denominator, numeric coverage, abstention/missing/invalid counts, reasons, and incorrect scoring of reference N/A cases. Report error at each coverage level. |
| How uncertain are the estimates? | Prespecified confidence intervals that respect repeated responses from a participant and task clustering. Report sparse groups and undefined coefficients explicitly. |
| Are ratings stable? | Repeated calls on a prespecified subset, prompt/version changes, paraphrases that preserve meaning, and source-preserving reorderings. Stability is distinct from accuracy. |
| Are there conditional disparities? | Error conditional on reference level, mode, prompt, and relevant consented subgroup factors; uncertainty and descriptive coverage. Never infer sensitive demographics from responses. |
| Is feedback defensible and helpful? | Blinded expert ratings of evidence relevance, factual support, actionable advice, unjustified criticism, and harmful/misleading statements. Numerical agreement alone misses these. |

For repeatability, a proposed initial subset is 50 responses with five scoring runs each. For invariance, test equivalent concise/verbose formulations, dialect variants with meaning preserved, viewpoint reversals with equal support, punctuation/spelling changes, and realistic transcript errors. Some alterations change meaning and should change assessment; have humans certify which pairs are truly invariant. Keep fairness reviews distinct from blanket “bias-free” claims.

Use calibrated error predictions only if they have their own held-out evaluation. A model's confidence label is not a substitute for coverage/error measurements. For improvement claims, run a later controlled study with blinded human-rated **new transfer tasks**, not just higher model scores on a prompted retry.

### Candidate release rules, explicitly proposed

The following numbers are discussion targets for low-stakes formative use, **not published universal standards or evidence that the app has passed**. An assessment specialist and product owner should pre-register acceptable loss and scope before inspecting the locked results. Adjust sample sizes, not the gates after seeing disappointing test data.

- The criterion must first pass expert content/applicability review and achieve a usable, documented independent-human baseline. Disagreement cannot be hidden by averaging unlike dimensions.
- Against an independent human baseline on the same items, proposed non-inferiority margins are at most +0.10 level MAE and −0.05 QWK, assessed using appropriately paired confidence intervals. These margins are product choices requiring justification; they may be too loose or strict for a particular use.
- Proposed absolute safeguards: the upper 95% bound on ≥2-level errors is at most 5%, and the signed-error interval lies within ±0.20 level. Report exact and within-one agreement even when these checks pass.
- Proposed minimum numeric coverage is 80% of reference-eligible responses while meeting error safeguards. Abstaining on nearly everything must not create an apparent accuracy success. Out-of-scope responses remain unscored.
- Exact quote/schema checks must pass on every accepted result in software tests. Separately, expert review should find no systematic invented factual support or misleading explanation pattern. This is not a promise that every future output is correct.
- Subgroup results must be interpretable with uncertainty; a small sample is **inconclusive**, not evidence of fairness. Predefine material conditional gaps and a multiple-comparison strategy. Restrict claims or gather more data when uncertainty is too wide.
- No known score-manipulation instruction should bypass the evaluation policy in the prespecified challenge set. Passing a finite set does not establish adversarial immunity.
- Publish the exact supported modes, language, population, versions, counts, error intervals, abstention policy, and unresolved limitations. If a mode/criterion fails, retain qualitative provisional coaching or abstain for that scope. Do not imply a staffed human review process unless one actually exists.

## Practical offline benchmark harness

The first deliverable should be a **measurement tool**, not a synthetic “calibration dataset.” It reads supplied human ratings and previously recorded model ratings, makes no network calls, and produces a report. A separate, explicitly authorized scoring runner can be added later; results must retain their actual provider/model/configuration provenance.

Input should include study/scope/split provenance; fixed scale; rubric/model/template/configuration versions; pseudonymous response/participant/prompt-family IDs; mode and criterion; independent human ratings; separately adjudicated reference; model score or explicit abstention; and evidence-validation outcomes when audited. Keep identifiable response text and annotation files outside the repository. Optional synthetic math fixtures must be labeled as such and excluded from validation claims.

The report should:

1. Group by mode and criterion, and refuse mixed scoring versions unless reported in separate groups. Retain context hashes; never pool incompatible versions into one improvement estimate.
2. Compute QWK using the declared four-level scale, plus direct-error metrics and counts. Compute raw human-pair metrics separately; pair counts are not independent response counts and must not inflate sample size.
3. Treat `null`, missing, and invalid outputs distinctly. Both-null is an applicability result, not perfect numeric agreement. A model abstention stays in the eligible coverage denominator. Invalid gold is an input error; invalid model output is a recorded failure, not a score of zero.
4. Return `null` with a reason for no comparable ratings, one observation when inference is unsupported, zero expected disagreement in QWK, or insufficient independent units for a confidence interval. Constant identical scores can have exact agreement 1 while QWK is undefined. Never convert an undefined coefficient to 1 or 0.
5. Provide reproducible seeded bootstrap intervals, with the resampling unit and limitations explicit. Participant clustering alone does not account for new-prompt generalization; use a separate prompt holdout or a richer statistical analysis. An interval from a synthetic demo has no population-validity interpretation.
6. Report sample sizes, valid bootstrap replicate counts, and warnings; do not silently discard a large fraction of undefined QWK replicates. Rare-error boundary cases need suitable one-sided inference or a specialist analysis: an all-zero empirical bootstrap does **not** prove a zero population error rate.
7. Avoid overall “validated” flags, automatic cutoffs, inferred demographics, and interpreting LLM confidence as measured accuracy. Any eventual calibration manifest should link a reviewed study, not merely a JSON file with optimistic numbers.

A later study manifest can record `status: unvalidated | evaluated_for_specified_use`, intended use, population, model/configuration/rubric/template versions, data/split hashes, sample counts, metric intervals, abstention rules, expert review, and known limitations. It must not act as an app-wide scientific certification switch.

## Current implementation boundary

At the start of this research, `server/evaluator.mjs` implemented an unvalidated local pattern coach with low-confidence levels 1–2 and an optional schema/evidence-validated model path. The local pattern scores are excluded from the chart. Existing provider tests verify mocked transport and validation behavior; they do not measure semantic accuracy. No live model benchmark or human-rated held-out calibration study has been completed in this work. Runtime revisions made after this note must retain that distinction until actual evidence exists.

Next meaningful work: finalize the original mode-specific rubric, commission independent human annotation, freeze a study protocol, record real model outputs for that scope, run the benchmark, inspect failures with assessment expertise, and only then decide which quantitative interpretations the evidence supports.
