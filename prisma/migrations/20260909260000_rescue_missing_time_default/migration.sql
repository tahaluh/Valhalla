UPDATE "categories"
SET "scoringFormula" = replace("scoringFormula", 'var times = [scores[1], scores[3], scores[5]];', 'var times = [scores[1] || 300, scores[3] || 300, scores[5] || 300];')
WHERE "type" = 'RESCUE';
