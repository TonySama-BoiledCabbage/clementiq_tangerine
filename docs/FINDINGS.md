# Findings: Tangerine Resilience Rewired

All numbers below were produced by `GET /api/insights` (`clementiq/core/insights.py`) on the full imported dataset on 2026-11-07. Re-run them at any time: open `/insights`, or call the endpoint. **Nothing on this page was written before the analysis ran.** Two of the hypotheses we expected turned out to be wrong; see §3.

Scope: n = 4,500 accounts, with judge definitions I, S, F, H, B and P (README). Demographic attributes (gender, birth date) are deliberately excluded.

## 1. How many customers survive the judges' twists?

| Twist | Median runway | < 3 months | ≥ 6 months | No shortfall |
|---|---|---|---|---|
| Job loss, EI 55% | 8.6 mo | 10.1% | 64.5% | 7.7% |
| EI 55% + household bills +15% | 7.8 mo | 11.6% | 61.1% | 5.4% |
| Furnace = 1 month of spending | 120 (no shortfall) | 6.4% | 91.2% | 75.5% |

**35% of customers would run out of buffer within 6 months on EI.** 45% hold less than 3 months of typical spending, and 4% hold less than 1 month.

## 2. Borrowers are much less resilient (the headline finding)

| Group | n | Median EI-55% runway | Survive 6 months |
|---|---|---|---|
| Running loan (status C/D) | 448 | 4.8 mo | **36%** |
| Finished loan (A/B) | 234 | 4.4 mo | 28% |
| No loan | 3,818 | 10.2 mo | **70%** |

Among the 682 loan accounts, the default rate by buffer quartile runs **23% (thinnest) → 6% → 10% → 5% (thickest)**.

*Caveat:* buffers are measured at the end of the data window, so a default may have *caused* a thin buffer. This is an association, not evidence that buffers prevent default.

## 3. Hypotheses the data rejected

- *"Higher fixed-cost burden means shorter runway."* The data shows the opposite. The median EI-55% runway is 8.7 months in the lowest F/I quintile and 15.3 in the highest. The lowest quintile is entirely F = 0: those accounts have no labelled bills, so their spending is unlabelled cash outflow. Fixed-cost share mostly measures *how much of spending is labelled*, not how burdened a household is.
- We expected most customers to fail a 6-month layoff. In fact 65% pass.

## 4. What predicts a thin buffer (< 1 month)?

A logistic regression with standardized features and 5-fold cross-validation reached **AUC 0.91** (n = 4,419, with 181 positives). The largest coefficient was **overdraft days in the last 12 months (+1.87)**, followed by spending variability and income variability. Spearman correlations with coverage are listed on `/insights`. These results are predictive, not causal.

## 5. Which intervention helps most? (common EI-55% shock, 4,155 accounts with a shortfall)

| Intervention | Median runway gain | Accounts newly ≥ 6 months |
|---|---|---|
| Save one extra month of spending | 2.44 mo | 839 |
| Cut discretionary outflows 10% | 1.39 mo | 329 |
| Cut household bills 10% | 0.34 mo | 107 |
| Add $1,000 to buffer | 0.29 mo | 82 |

These are modeled effects that hold the other inputs fixed. Real behaviour changes are not guaranteed.

## 6. Regional context

Across 77 districts, the district-level Spearman ρ between unemployment and median runway is −0.08, and between average salary and median runway it is +0.14. These are weak ecological associations and say nothing about individuals.

The districts are the bank's original branch districts in the Czech Republic (names such as Praha or Brno). The organizers converted all money to CAD but left the geography as is, so this result is not about Canadian regions.

## Limitations

- The data is observational, so none of the above are causal effects.
- B is an average balance in one bank account. Customers may hold savings elsewhere.
- Loan status and buffers are measured at the end of the window (possible reverse causality).
- The dataset is the anonymized PKDD'99 financial data from a Czech bank. The organizers converted all money (balances, transactions, bills, loans, salaries) to CAD; shocks are sized with Canadian sources (EI, Statistics Canada CPI and rents).
