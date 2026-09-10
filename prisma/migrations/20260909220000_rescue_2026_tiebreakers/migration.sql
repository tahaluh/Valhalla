UPDATE "categories"
SET "scoringFormula" = '(function(scores) {
  var rounds = [scores[0], scores[2], scores[4]];
  var times = [scores[1], scores[3], scores[5]];
  var worstIdx = 0;
  for (var i = 1; i < rounds.length; i++) {
    if (rounds[i] < rounds[worstIdx]) worstIdx = i;
  }
  var total = 0;
  var totalTime = times[0] + times[1] + times[2];
  for (var j = 0; j < rounds.length; j++) {
    if (j !== worstIdx) total += rounds[j];
  }
  var highest = Math.max(rounds[0], rounds[1], rounds[2]);
  var fastestHighest = 300;
  for (var k = 0; k < rounds.length; k++) {
    if (rounds[k] === highest && times[k] < fastestHighest) fastestHighest = times[k];
  }
  return [total, totalTime, fastestHighest, -rounds[worstIdx], -rounds[0], -rounds[1], -rounds[2]];
})'
WHERE "type" = 'RESCUE';
