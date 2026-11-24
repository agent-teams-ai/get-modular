# Compare independent expected plan/digest or the required rejection code.
# The entire structured output (including ordered diagnostics) is compared
# separately across targets. Matching error text alone is not evidence.
. as $actual | $cases[0] as $expected
| (length == ($expected | length))
  and (map(.name) == ($expected | map(.name)))
  and all(range(0; length);
    . as $i | $actual[$i].result as $result | $expected[$i] as $case
    | if $case.expectedDigest then
        $result.ok == true and $result.digest == $case.expectedDigest
        and $result.plan == $case.expectedPlan
      else
        $result.ok == false
        and any($result.diagnostics[]; .code == $case.expectedCode)
      end)
