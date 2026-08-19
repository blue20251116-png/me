function ts(sec){const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=(sec%60).toFixed(2).padStart(5,'0');return `${h}:${String(m).padStart(2,'0')}:${s}`;}
export function buildAss(captions=[]){
  const header='[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,Arial,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,1,2,60,60,250,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n';
  return header+captions.map(c=>`Dialogue: 0,${ts(c.start)},${ts(c.end)},Default,,0,0,0,,${String(c.text).replace(/\n/g,'\\N')}`).join('\n');
}
