import sys; sys.path.insert(0,'/home/user/MacroFXModel')
from GlobalLiquidity.config import CB_BLOCKS
b=CB_BLOCKS['USD']; comps={'walcl':6_755_639.0,'tga':883_373.0,'rrp':0.1}   # FRED units 2026-10-14: $M, $M, $B
print('GlobalLiquidity USD block =',eval(b['formula'],{'__builtins__':{}},comps),'$bn  (correct ≈',6755.639-883.373-0.1,')')
