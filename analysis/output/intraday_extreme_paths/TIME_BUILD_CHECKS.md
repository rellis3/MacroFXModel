# IEP-TIME build checks

rows 1,509,290 (34 instruments), oos rows 767,399; carry races 828,214

## 1. Running OH at checkpoint: IEP table vs export table (both % of open; export rounds to 4dp)
median |diff| 0.00002, p99 0.00005, share > 0.01pp 0.0000

## 2. First-touch consistency: line untouched at h <=> running extreme below the line
ohp50: mismatch share 0.00005
ohp75: mismatch share 0.00001
ohp90: mismatch share 0.00000
olp50: mismatch share 0.00009
olp75: mismatch share 0.00003
olp90: mismatch share 0.00001

## 3. FT: share of rows where both p75 lines were touched in the same minute (ambiguous), all blocks
0.00002 of all rows; 0.223 not eligible (a p75 line already touched)

## 4. Carry levels: touched after the window vs never touched (all blocks; outcome counts deliberately not shown)
               size   mean
win    kind               
asia   plc+  129152  0.662
       plc-  125442  0.654
       real  151764  0.719
london plc+  135443  0.550
       plc-  133114  0.544
       real  153299  0.604