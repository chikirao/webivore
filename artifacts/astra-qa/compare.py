from PIL import Image,ImageChops
from pathlib import Path
out=Path('artifacts/astra-qa')
for state,n in [('entry','04-overdrive-entry'),('game','05-overdrive-game'),('finish','06-overdrive-finish')]:
 ref=Image.open('docs/concepts/'+n+'.png').convert('RGB')
 shot=Image.open('artifacts/shots/'+({'game':'game-68-mid'}.get(state,state))+'-desktop.png').convert('RGB')
 side=Image.new('RGB',(3072,1024),'white');side.paste(ref,(0,0));side.paste(shot,(1536,0));side.save(out/(state+'-comparison.png'))
 Image.blend(ref,shot,.5).save(out/(state+'-overlay.png'))
 ImageChops.difference(ref,shot).save(out/(state+'-difference.png'))
