"""Estimated category allocation for spending the dataset does not label.

The Tangerine data labels household bills, insurance, loan payments and fees, but not groceries,
fuel or transit. To model events such as fuel-price or food-price changes, ClementIQ allocates the
account's *discretionary* outflows D using approximate national shares. These are ESTIMATES and are
always labelled as such in the UI and API; users can override them in Settings.

Shares are approximations of non-shelter consumption shares from Statistics Canada, Survey of
Household Spending (Table 11-10-0222-01), rounded and renormalised to sum to 1.
"""
ALLOCATION_SOURCE = ("approximate shares of non-shelter consumption, Statistics Canada Table "
                     "11-10-0222-01 (https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1110022201)")

ESTIMATED_ALLOCATION: dict[str, float] = {
    "transportation": 0.25,
    "food": 0.20,
    "household_operations": 0.10,
    "health_personal": 0.08,
    "recreation": 0.09,
    "clothing": 0.06,
    "other": 0.22,
}

assert abs(sum(ESTIMATED_ALLOCATION.values()) - 1.0) < 1e-9
