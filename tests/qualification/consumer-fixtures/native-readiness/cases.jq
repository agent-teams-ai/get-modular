# Mechanical projection of existing owner vectors, not a candidate-derived oracle.
def encoded: map(tojson);
def hexbytes:
  [scan("..") | [explode[] | if . >= 97 then . - 87 else . - 48 end]
   | .[0] * 16 + .[1]];

($norm[0].cases[0]) as $first
| ($first.equivalentProfiles[0]) as $profile
| {"family":"exact","familyVersion":1,"token":"example/app-access/v1"} as $compat
| [
    ($norm[0].cases[] as $v
     | ($v.declarationOrders | to_entries[]) as $order
     | ($v.equivalentProfiles | to_entries[]) as $p
     | {name: ($v.name + "-" + ($order.key|tostring) + "-" + ($p.key|tostring)),
        declarations: [$order.value[] as $id | $v.declarations[] | select(.implementationId == $id) | tojson],
        profile: ($p.value|tojson), expectedPlan: $v.expectedPlan, expectedDigest: $v.digest}),
    ($canon[0].negative[] |
      {name: .name, declarations: [], profile: .rawJson, expectedCode: .diagnosticCode}),
    ($decoder[0].cases[] | select(.name == "invalid-utf8-unexpected-continuation") |
      {name: .name, declarations: [], profile: (.source|hexbytes), expectedCode: .diagnosticCode}),
    {name: "missing-required-binding", declarations: ($first.declarations|encoded),
     profile: ($profile | .bindings |= map(select(.slotId != "database")) | tojson),
     expectedCode: "binding.missing"},
    {name: "selected-cycle",
     declarations: ($first.declarations | map(
       if .moduleId == "example/app" then
         .provides += [{capabilityId:"example/app-access",compatibility:$compat}]
       elif .moduleId == "example/database" then
         .slots += [{slotId:"app",capabilityId:"example/app-access",compatibility:$compat,cardinality:{kind:"required"}}]
       else . end) | encoded),
     profile: ($profile | .bindings += [{consumerImplementationId:"example/database/default",slotId:"app",providerImplementationIds:["example/app/default"]}] | tojson),
     expectedCode: "graph.cycle"},
    ($resource[0].profileV2.cases[] | select(.limitName == "profileRawDocumentBytes") |
      {name: "raw-profile-over-limit", declarations: [],
       profile: {zeroBytes: .over}, expectedCode: .overOutcome,
       expectedLimit: .limitName, expectedMaximum: .at, expectedActual: .over})
  ]
| map(.profile |= (if type == "string" then {kind: "text", text: .}
    elif type == "array" then {kind: "bytes", bytes: .}
    else {kind: "zeroes", size: .zeroBytes} end))
| if length >= 12 and (map(.name) | unique | length) == length
  then . else error("Missing or duplicate experiment inputs") end
