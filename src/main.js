import './style.css';
import {createVariationHover, configureVariationProvider} from './variation-api.js';
import {emptyBoard, coordinate} from './go.js';
import {replayFrames, previewVariation, candidatePercentage, visibleCandidates, candidateLabel, maximumCandidateVisits, candidateVisitColors} from './board-view.js';
import {parseSGF, exportSGF} from './sgf.js';
import {SgfReview} from './sgf-review.js';
import {EngineSession} from './engine-session.js';
import {setupWorkspaceResize, setupBoardSizing} from './workspace-layout.js';
import {setupBoardInput, createTouchPreview} from './board-input.js';

const icons={board:'▦',chart:'↗',folder:'▱',settings:'⚙',chevron:'⌄',back:'←',forward:'→',first:'⇤',last:'⇥',play:'▶',pause:'Ⅱ',download:'↓',upload:'↑',expand:'⤢',undo:'↶',plus:'＋'};
const icon=key=>'<span class="icon" aria-hidden="true">'+(icons[key]||key)+'</span>';
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pointLabel=index=>index===null?'停一手':coordinate(index);
const candidateIndex=value=>value==='pass'?null:Number(value);
const compactNumber=new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1,roundingMode:'trunc'});
const formatNumber=value=>Number.isFinite(value)?(value<1000?String(value):compactNumber.format(value)):'—';
const rateText=value=>Number.isFinite(value)?(value*100).toFixed(1)+'%':'—';
const boardRateText=(winRateBlack,toPlay)=>Number.isFinite(winRateBlack)?((toPlay===2?1-winRateBlack:winRateBlack)*100).toFixed(1):'—';
const scoreText=value=>Number.isFinite(value)?(value===0?'均势':(value>0?'黑':'白')+' +'+Math.abs(value).toFixed(1)):'—';
let storage;
try { storage=window.sessionStorage; } catch { storage=undefined; }
function readLocal(key,fallback) { try { return JSON.parse(storage?.getItem(key)??'null')??fallback; } catch { return fallback; } }
function saveLocal(key,value) { try { storage?.setItem(key,JSON.stringify(value)); } catch {} }
const endpoint=import.meta.env.VITE_ENGINE_WS_URL||((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');
const sgfReview=new SgfReview({storage,key:'yijian-sgf-review:'+endpoint});
const preferences=readLocal('yijian-preferences',{showCandidates:true,showNumbers:false});
let candidatePercent=candidatePercentage(preferences.candidatePercent);
let moves=[],position=0,showCandidates=preferences.showCandidates,showNumbers=preferences.showNumbers,selectedTab='candidates',mode='analysis',timer=null;
let settings={...readLocal('yijian-players',{black:'玩家 1',white:'玩家 2'}),komi:7.5,rules:'chinese'};
let frames=[{board:emptyBoard(),captures:[0,0],next:1}],snapshot=null,session,busy=false,connectionStatus='connecting',genmoveController=null;
let hoverTarget=null,toastTimer,scrubbing=false;
let touchInput=window.matchMedia('(pointer: coarse)').matches;
const rates=new Map();
const ruleNames={chinese:'中国规则'};

document.querySelector('#app').innerHTML=`
<aside class="rail" aria-label="工作台工具">
  <a class="brand" href="#" aria-label="弈间首页"><span class="brand-mark">弈</span><span class="brand-caption">YIJIAN</span></a>
  <nav class="rail-nav" aria-label="棋局模式">
    <button class="rail-button active" data-nav="analysis" aria-label="分析棋局">${icon('board')}<span>分析棋局</span></button>
    <button class="rail-button" data-nav="play" aria-label="自由对弈">${icon('chart')}<span>自由对弈</span></button>
  </nav>
  <div class="rail-group"><span class="rail-label">棋谱</span>
    <button class="rail-button" id="new">${icon('plus')}<span>重开棋局</span></button>
    <button class="rail-button" id="import">${icon('upload')}<span>导入棋谱</span></button>
    <button class="rail-button" id="export">${icon('download')}<span>导出 SGF</span></button>
  </div>
  <div class="rail-group"><span class="rail-label">落子</span>
    <button class="rail-button" id="genmove">AI 落子</button>
    <button class="rail-button" id="pass">${icon('◯')}<span>停一手</span></button>
    <button class="rail-button" id="clear-board">${icon('◇')}<span>清枰</span></button>
  </div>
  <button class="rail-button rail-bottom" id="settings" aria-label="偏好设置">${icon('settings')}<span>偏好设置</span></button>
  <span class="rail-signature">一枰 · 一境</span>
</aside>
<div class="workspace">
  <header><div class="wordmark">弈间<span>YIJIAN</span></div><h1 class="breadcrumb">工作台 <span>/</span> <strong>棋局分析</strong></h1><div class="header-right"><span class="local-dot" id="connection-dot"></span><span id="connection-status" role="status">连接中</span><span class="header-divider"></span><a href="#" id="help">使用指南 ↗</a></div></header>
  <main><section class="dashboard" aria-label="围棋工作台">
    <div class="board-column"><section class="board-card" aria-label="棋盘与复盘">
      <div class="board-top"><div class="segmented"><button class="selected" data-mode="analysis">分析棋局</button><button data-mode="play">自由对弈</button></div><span class="game-meta">19 路 · 贴目 7.5 · 中国规则</span><button class="bare" id="expand" aria-label="专注棋盘" aria-pressed="false" title="专注棋盘">${icon('expand')}</button></div>
      <div class="players"><div class="player"><span class="stone black" aria-hidden="true"></span><div><strong><span id="black-player" class="player-name">玩家 1</span><span>执黑</span></strong><small>提子 <b id="black-captures">0</b></small></div></div><div class="turn-label"><span class="pulse-dot"></span><span id="turn">黑方行棋</span></div><div class="player white-player"><div><strong><span id="white-player" class="player-name">玩家 2</span><span>执白</span></strong><small>提子 <b id="white-captures">0</b></small></div><span class="stone white" aria-hidden="true"></span></div></div>
      <div class="board-stage"><div class="board-wrap"><svg id="board" viewBox="0 0 660 660" role="group" aria-label="19路围棋棋盘"></svg></div></div>
      <div id="touch-preview" class="touch-preview" hidden><div><strong id="touch-preview-target"></strong><span>再点同一点落子 · 点其他位置切换</span><p id="touch-preview-status" role="status"></p></div><button id="exit-preview" type="button">退出预览</button></div>
      <div class="board-caption"><span><span class="key-dot"></span> <span id="board-input-hint"></span></span><span id="last-move"></span></div>
      <div class="board-options"><label><input type="checkbox" id="candidates" checked>显示候选点</label><label><input type="checkbox" id="numbers">显示手数</label><span>19 × 19</span></div>
    </section></div>
    <div id="workspace-divider" role="separator" tabindex="0" aria-label="调整分析栏宽度" aria-orientation="vertical" aria-controls="analysis-panel" title="拖动调整宽度，双击恢复；方向键微调"></div>
    <aside class="analysis-column" id="analysis-panel" aria-label="AI 分析">
      <section class="panel engine-panel"><div class="panel-heading"><h2><span class="green-spark" aria-hidden="true">✳</span> AI 分析</h2><span class="connection-badge" id="engine-badge">等待连接</span></div><div class="engine-info"><div><strong>引擎分析 <span id="analysis-status">尚未连接</span></strong><p id="engine-description">正在连接围棋服务</p></div><button id="analysis-toggle" aria-label="开始分析">${icon('play')}<span>开始分析</span></button></div><div class="engine-stats"><div><small>搜索访问量</small><b><span id="engine-visits">0</span><span>visits</span></b></div><div><small>搜索速度</small><b><span id="engine-speed">0</span><span>visits/s</span></b></div></div></section>
      <section class="panel evaluation"><div class="panel-heading"><h2>局势评估</h2><span class="muted">黑方视角</span></div><div class="win-heading"><div><span>黑方胜率</span><strong id="win-rate">—</strong></div><div class="lead"><span>预计目差</span><b id="score">—</b></div></div><div class="win-bar"><div id="black-bar"></div></div><div class="bar-labels"><span>● 黑 <b id="black-percent">—</b></span><span>○ 白 <b id="white-percent">—</b></span></div></section>
      <section class="panel recommendation"><div class="analysis-tabs" role="tablist" aria-label="分析详情"><button class="active" id="tab-candidates" role="tab" aria-selected="true" aria-controls="tab-content" data-tab="candidates">推荐选点 <span id="candidate-count">0</span></button><button id="tab-chart" role="tab" aria-selected="false" aria-controls="chart-section" tabindex="-1" data-tab="chart">胜率走势</button><button id="tab-history" role="tab" aria-selected="false" aria-controls="tab-content" tabindex="-1" data-tab="history">落子记录</button></div>
        <div id="tab-content" role="tabpanel" aria-labelledby="tab-candidates" tabindex="0"></div>
        <div id="chart-section" role="tabpanel" aria-labelledby="tab-chart" tabindex="0" hidden><div class="chart-title">胜率走势<span>当前第 <b id="chart-position">0</b> 手</span></div><div class="chart-legend"><span><i class="black-line"></i>黑棋 <b id="chart-black"></b></span><span><i class="white-line"></i>白棋 <b id="chart-white"></b></span></div><div id="chart"></div><div class="chart-axis"><span>开局</span><span>手数</span><span id="chart-end">0</span></div><p class="chart-hint">仅显示已分析的局面，空缺表示尚未分析。</p></div>
        <div class="candidate-control"><div class="candidate-control-heading"><label for="candidate-percent">候选点显示</label><output id="candidate-percent-value" for="candidate-percent">10%</output><span id="candidate-visible-count">选取 0 / 0 个</span></div><input type="range" id="candidate-percent" aria-label="候选点显示比例" min="0" max="100" step="1" value="10" aria-describedby="candidate-percent-hint"><p id="candidate-percent-hint">按比例显示 3–30 个，不足 3 个时全部显示。</p></div>
      </section>
      <div class="playback"><p id="next-move" role="status" hidden></p><input type="range" id="move-slider" min="0" max="0" value="0" aria-label="棋谱手数"><div class="playback-row"><div class="step-counter">第 <strong id="move-count">0</strong> 手 <span id="total-count">/ 0</span></div><div class="playback-buttons"><button data-step="first" aria-label="回到开局" title="回到开局">${icon('first')}</button><button data-step="back" aria-label="上一手" title="上一手 · ←">${icon('back')}</button><button id="autoplay" aria-label="自动复盘" title="自动复盘 · 空格">${icon('play')}</button><button data-step="forward" aria-label="下一手" title="下一手 · →">${icon('forward')}</button><button data-step="last" aria-label="最新一手" title="最新一手">${icon('last')}</button></div><button class="bare undo" id="undo">${icon('undo')} 悔棋</button></div></div>
    </aside>
  </section><footer><span id="session-note">导出 SGF，留存每一局</span><span>← → 逐手复盘 <kbd>Space</kbd> 播放 / 暂停</span></footer></main>
</div><input type="file" id="file" accept=".sgf" hidden><div id="toast" role="status"></div><dialog id="dialog"></dialog>`;

setupWorkspaceResize(document.querySelector('.dashboard'), document.querySelector('#workspace-divider'), storage);
const compactLayout=window.matchMedia('(max-width: 1000px)');
function placePlayback() {
  const besideBoard=compactLayout.matches||document.querySelector('.dashboard').classList.contains('expanded');
  const card=document.querySelector('.board-card'),stage=document.querySelector('.board-stage');
  const top=document.querySelector('.board-top'),players=document.querySelector('.players');
  const options=document.querySelector('.board-options'),playback=document.querySelector('.playback');
  if(besideBoard){
    card.insertBefore(top,stage);
    card.insertBefore(players,stage);
    card.append(options,playback);
  }else{
    document.querySelector('header').insertBefore(top,document.querySelector('.header-right'));
    document.querySelector('.evaluation').prepend(players);
    document.querySelector('.analysis-column').append(playback,options);
  }
}
if(compactLayout.addEventListener)compactLayout.addEventListener('change',placePlayback);
else compactLayout.addListener(placePlayback);
placePlayback();
setupBoardSizing(document.querySelector('.board-stage'),document.querySelector('.board-wrap'),compactLayout);

function candidates(source=snapshot) { return visibleCandidates(source?.analysis?.candidates??[],candidatePercent); }
function candidateVisitsMaximum() { return maximumCandidateVisits(snapshot?.analysis?.candidates??[]); }
function candidateList() { return candidates().map(candidate=>candidate.index).filter(index=>index!==null); }
function reviewMoves() { return sgfReview.line(moves); }
function positionKey(p=position,line=moves) { return settings.komi+':'+settings.rules+':'+line.slice(0,p).map(move=>move.color+','+move.index).join(';'); }

function stoneMarkup(board,numbers=new Map()) {
  return board.map((color,index)=>{
    if(!color)return '';
    const x=42+index%19*32,y=42+Math.floor(index/19)*32,number=numbers.get(index);
    const shell=color===2?'<path d="M'+(x-9)+' '+(y-9)+'Q'+(x+1)+' '+(y-4)+' '+(x+12)+' '+(y-5)+' M'+(x-12)+' '+(y-5)+'Q'+x+' '+(y+1)+' '+(x+13)+' '+y+' M'+(x-13)+' '+y+'Q'+x+' '+(y+6)+' '+(x+12)+' '+(y+5)+' M'+(x-11)+' '+(y+5)+'Q'+x+' '+(y+10)+' '+(x+8)+' '+(y+10)+'" fill="none" stroke="#b3ad96" stroke-width=".5" opacity=".19"/>':'';
    return '<g class="board-stone"><circle cx="'+x+'" cy="'+y+'" r="14.9" fill="url(#'+(color===1?'blackStone':'whiteStone')+')" stroke="'+(color===1?'#101414':'#c8c6bb')+'" stroke-width=".45" filter="url(#shadow)"/>'+shell+
      '<ellipse cx="'+(x-3.8)+'" cy="'+(y-5.4)+'" rx="8.4" ry="5.8" fill="url(#stoneGlaze)" opacity="'+(color===1?'.32':'.65')+'"/>'+
      (number?'<text x="'+x+'" y="'+(y+4)+'" font-size="11" font-weight="500" text-anchor="middle" fill="'+(color===1?'#fff':'#30352f')+'">'+number+'</text>':'')+'</g>';
  }).join('');
}

function candidateMarkersMarkup() {
  const maximumVisits=candidateVisitsMaximum();
  if(!showCandidates||mode!=='analysis')return '';
  return candidates().map((candidate,n)=>{
    if(candidate.index===null)return '';
    const x=42+candidate.index%19*32,y=42+Math.floor(candidate.index/19)*32;
    const colors=candidateVisitColors(candidate.visits,maximumVisits);
    return '<g class="candidate-marker" data-marker-index="'+candidate.index+'" text-anchor="middle" fill="'+colors.text+'" font-family="sans-serif"><circle cx="'+x+'" cy="'+y+'" r="15" fill="'+colors.fill+'"/><text x="'+x+'" y="'+(y-5.5)+'" font-size="9" font-weight="600">'+candidateLabel(n)+'</text><text class="candidate-rate" x="'+x+'" y="'+(y+2.5)+'" font-size="7">'+boardRateText(candidate.winRateBlack,frames[position].next)+'</text><text class="candidate-visits" x="'+x+'" y="'+(y+10)+'" font-size="6.5" font-weight="500">'+formatNumber(candidate.visits)+'</text></g>';
  }).join('');
}

function nextMoveLabel() {
  if(!sgfReview.matches(moves,position))return '试下中 · 回退或播放返回原棋谱';
  const next=sgfReview.next(moves,position);
  return next?'棋谱下一手：'+(next.color===1?'黑':'白')+' '+pointLabel(next.index):'';
}

function nextMoveMarkerMarkup() {
  const next=sgfReview.next(moves,position);
  if(!next||next.index===null)return '';
  const x=42+next.index%19*32,y=42+Math.floor(next.index/19)*32;
  return '<g data-next-index="'+next.index+'" role="img" aria-label="'+nextMoveLabel()+'"><circle class="next-move-halo" cx="'+x+'" cy="'+y+'" r="17"/><circle class="next-move-ring" cx="'+x+'" cy="'+y+'" r="17"/></g>';
}

function drawBoard() {
  const f=frames[position];
  let html=`<defs>
    <radialGradient id="blackStone" cx="35%" cy="29%" r="72%"><stop stop-color="#555b59"/><stop offset=".28" stop-color="#323938"/><stop offset=".64" stop-color="#171d1d"/><stop offset=".9" stop-color="#080d0e"/><stop offset="1" stop-color="#343b3a"/></radialGradient>
    <radialGradient id="whiteStone" cx="34%" cy="27%" r="74%"><stop stop-color="#fffefa"/><stop offset=".4" stop-color="#fcfbf6"/><stop offset=".72" stop-color="#eeece2"/><stop offset=".92" stop-color="#c6c7bb"/><stop offset="1" stop-color="#f1f0e6"/></radialGradient>
    <radialGradient id="stoneGlaze"><stop stop-color="#fff" stop-opacity=".55"/><stop offset=".55" stop-color="#fff" stop-opacity=".13"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <filter id="shadow" x="-40%" y="-35%" width="190%" height="195%" color-interpolation-filters="sRGB"><feDropShadow dx=".5" dy=".9" stdDeviation=".45" flood-color="#33240f" flood-opacity=".48"/><feDropShadow dx="1.4" dy="2.4" stdDeviation="1.65" flood-color="#382810" flood-opacity=".28"/></filter>
  </defs>`;
  for(let n=0;n<19;n++){
    const a=42+n*32;
    html+='<path d="M42 '+a+'H618 M'+a+' 42V618" stroke="#564020" stroke-width="'+(n===0||n===18?1.25:.7)+'" opacity=".8"/><text x="'+a+'" y="23" class="coord">'+'ABCDEFGHJKLMNOPQRST'[n]+'</text><text x="'+a+'" y="644" class="coord">'+'ABCDEFGHJKLMNOPQRST'[n]+'</text><text x="20" y="'+(a+4)+'" class="coord">'+(19-n)+'</text><text x="640" y="'+(a+4)+'" class="coord">'+(19-n)+'</text>';
  }
  for(const x of [3,9,15])for(const y of [3,9,15])html+='<circle cx="'+(42+x*32)+'" cy="'+(42+y*32)+'" r="3.2" fill="#5f523a"/>';
  const numbers=new Map();
  if(showNumbers)moves.slice(0,position).forEach((move,index)=>{if(move.index!==null)numbers.set(move.index,index+1);});
  html+='<g id="position-stones">'+stoneMarkup(f.board,numbers);
  const last=moves[position-1];
  if(!showNumbers&&last?.index!==null&&last!==undefined){
    const x=42+last.index%19*32,y=42+Math.floor(last.index/19)*32;
    html+='<rect x="'+(x-4)+'" y="'+(y-4)+'" width="8" height="8" rx="1" fill="none" stroke="'+(last.color===1?'#fff':'#647b5a')+'" stroke-width="1.6"/>';
  }
  html+='</g><g id="candidate-markers">'+candidateMarkersMarkup();
  html+='</g><g id="next-move-marker" pointer-events="none">'+nextMoveMarkerMarkup()+'</g><g id="variation-overlay" pointer-events="none"></g><circle id="touch-selection" class="touch-selection" r="16" visibility="hidden" pointer-events="none"/><circle id="hover-stone" r="14.9" fill="url(#'+(f.next===1?'blackStone':'whiteStone')+')" opacity=".58" visibility="hidden" pointer-events="none"/>';
  for(let index=0;index<361;index++)html+='<rect class="intersection" data-index="'+index+'" x="'+(26+index%19*32)+'" y="'+(26+Math.floor(index/19)*32)+'" width="32" height="32" fill="transparent" tabindex="0" role="button" aria-label="'+coordinate(index)+(f.board[index]?(f.board[index]===1?' 黑子':' 白子'):' 落子')+'"/>';
  document.querySelector('#board').innerHTML=html;
}

function renderChart() {
  const line=reviewMoves(),groups=[];let current=[];
  for(let p=0;p<=line.length;p++){
    const rate=rates.get(positionKey(p,line));
    if(Number.isFinite(rate))current.push({x:p/Math.max(line.length,1)*310,rate});
    else if(current.length){groups.push(current);current=[];}
  }
  if(current.length)groups.push(current);
  let html='<svg viewBox="0 0 350 125" role="img" aria-label="黑棋实线、白棋虚线；仅显示已分析的局面"><title>黑棋实线、白棋虚线；空缺表示该局面尚无分析</title>';
  for(const value of [0,25,50,75,100])html+='<path d="M0 '+(110-value)+'H310" stroke="#e4e9de" stroke-dasharray="3 4"/><text x="317" y="'+(113-value)+'">'+value+'%</text>';
  for(const color of ['black','white'])for(const group of groups){
    const stroke=color==='black'?'#303b2d':'#9aa789';
    html+='<polyline points="'+group.map(point=>point.x+','+(110-(color==='black'?point.rate:1-point.rate)*100)).join(' ')+'" fill="none" stroke="'+stroke+'" stroke-width="2" '+(color==='white'?'stroke-dasharray="5 3"':'')+'/>';
    for(const point of group)html+='<circle cx="'+point.x+'" cy="'+(110-(color==='black'?point.rate:1-point.rate)*100)+'" r="2" fill="'+stroke+'"/>';
  }
  if(!groups.length)html+='<text x="155" y="62" text-anchor="middle" class="chart-empty">暂无分析结果</text>';
  html+='<path d="M'+Math.min(position,line.length)/Math.max(line.length,1)*310+' 10V110" stroke="#abb49f" stroke-dasharray="3 3"/></svg>';
  document.querySelector('#chart').innerHTML=html;
}

function render(preserveHover=false) {
  const maximumVisits=candidateVisitsMaximum();
  if(!preserveHover){cancelVariation();drawBoard();}
  else {
    const markers=document.querySelector('#candidate-markers');
    const indices=showCandidates&&mode==='analysis'?candidateList():[];
    if(JSON.stringify([...markers.children].map(marker=>Number(marker.dataset.markerIndex)))!==JSON.stringify(indices)){
      // Only replace the decorative layer, never the pointer targets or preview.
      markers.innerHTML=candidateMarkersMarkup();
    }
    candidates().filter(candidate=>candidate.index!==null).forEach((candidate,index)=>{
      const marker=markers.children[index];
      if(marker){
        const colors=candidateVisitColors(candidate.visits,maximumVisits);
        marker.setAttribute('fill',colors.text);
        marker.querySelector('circle').setAttribute('fill',colors.fill);
        marker.querySelector('text').textContent=candidateLabel(candidates().indexOf(candidate));
        marker.querySelector('.candidate-rate').textContent=boardRateText(candidate.winRateBlack,frames[position].next);
        marker.querySelector('.candidate-visits').textContent=formatNumber(candidate.visits);
      }
    });
  }
  renderInputHints();renderSettings();
  renderCandidateControl();
  const f=frames[position],root=snapshot?.analysis?.root,rate=root?.winRateBlack;
  document.querySelector('#turn').textContent=snapshot?.terminal!=null?'棋局已结束':f.next===1?'黑方行棋':'白方行棋';
  document.querySelector('#black-captures').textContent=f.captures[0];
  document.querySelector('#white-captures').textContent=f.captures[1];
  document.querySelector('#move-count').textContent=position;
  document.querySelector('#total-count').textContent='/ '+reviewMoves().length;
  const moveSlider=document.querySelector('#move-slider');
  moveSlider.max=reviewMoves().length;
  if(!scrubbing){
    moveSlider.value=position;
    moveSlider.setAttribute('aria-valuetext','第 '+position+' 手，共 '+reviewMoves().length+' 手');
  }
  document.querySelector('#last-move').textContent=position?'上一手：'+(moves[position-1].color===1?'黑':'白')+' '+pointLabel(moves[position-1].index):'等待第一手';
  const nextMove=document.querySelector('#next-move'),nextLabel=nextMoveLabel();
  nextMove.hidden=!nextLabel;
  if(nextMove.textContent!==nextLabel)nextMove.textContent=nextLabel;
  document.querySelector('#win-rate').innerHTML=Number.isFinite(rate)?(rate*100).toFixed(1)+'<small>%</small>':'—';
  document.querySelector('#black-bar').style.width=Number.isFinite(rate)?rate*100+'%':'0%';
  document.querySelector('.win-bar').classList.toggle('unavailable',!Number.isFinite(rate));
  for(const id of ['black-percent','chart-black'])document.querySelector('#'+id).textContent=rateText(rate);
  for(const id of ['white-percent','chart-white'])document.querySelector('#'+id).textContent=rateText(Number.isFinite(rate)?1-rate:null);
  document.querySelector('#score').textContent=scoreText(root?.scoreLeadBlack);
  document.querySelector('#chart-position').textContent=position;
  document.querySelector('#chart-end').textContent=reviewMoves().length;
  renderChart();renderTab(preserveHover);renderConnection();
}

function renderTab(preserveHover=false) {
  if(!preserveHover)cancelVariation();
  const el=document.querySelector('#tab-content'),maximumVisits=candidateVisitsMaximum();
  document.querySelector('#candidate-count').textContent=candidates().length;
  el.hidden=selectedTab==='chart';
  document.querySelector('#chart-section').hidden=selectedTab!=='chart';
  document.querySelector('.candidate-control').hidden=selectedTab!=='candidates';
  el.setAttribute('aria-labelledby','tab-'+selectedTab);
  if(selectedTab==='chart')return;
  const rows=[...el.querySelectorAll('.candidate-row')];
  const sameCandidates=JSON.stringify(rows.map(row=>row.dataset.candidate))===JSON.stringify(candidates().map(candidate=>String(candidate.index??'pass')));
  if(preserveHover&&(selectedTab==='history'||sameCandidates)){
    if(selectedTab==='candidates')document.querySelectorAll('.candidate-row').forEach((row,index)=>{
      const candidate=candidates()[index];
      const colors=candidateVisitColors(candidate.visits,maximumVisits),rank=row.querySelector('.rank');
      rank.style.backgroundColor=colors.fill;
      rank.style.color=colors.text;
      row.children[1].textContent=rateText(candidate.winRateBlack);
      row.children[2].textContent=scoreText(candidate.scoreLeadBlack);
      row.children[3].textContent=formatNumber(candidate.visits);
    });
    return;
  }
  if(selectedTab==='history'){
    const line=reviewMoves();
    el.innerHTML='<div class="history-list">'+(line.length?line.map((move,index)=>'<button data-jump="'+(index+1)+'" class="'+(position===index+1&&sgfReview.matches(moves,position)?'current':'')+'"><span>'+(index+1)+'</span><span>'+(move.color===1?'●':'○')+'</span><b>'+pointLabel(move.index)+'</b></button>').join(''):'<p class="empty">落子后将在这里显示棋谱记录。</p>')+'</div>';
    return;
  }
  const markup='<div class="table-heading"><span>选点</span><span>黑方胜率</span><span>目差</span><span>访问量</span></div>'+
    (candidates().length?'<div class="candidate-list">'+candidates().map((candidate,n)=>{
      const colors=candidateVisitColors(candidate.visits,maximumVisits);
      return '<button class="candidate-row" data-candidate="'+(candidate.index??'pass')+'"><span><b class="rank" style="background-color:'+colors.fill+';color:'+colors.text+'">'+candidateLabel(n)+'</b><strong>'+pointLabel(candidate.index)+'</strong>'+(n===0?'<em>首选</em>':'')+'</span><b>'+rateText(candidate.winRateBlack)+'</b><span>'+scoreText(candidate.scoreLeadBlack)+'</span><span>'+formatNumber(candidate.visits)+'</span></button>';
    }).join('')+'</div>':'<p class="empty analysis-empty">当前局面暂无推荐选点。连接可用算力并开始分析后显示。</p>')+
    '<div class="variation" data-variation-region><span>参考变化</span><p id="variation-status" role="status">'+variationIdleHint()+'</p><small id="variation-hint">'+variationHint()+'</small></div>';
  if(!preserveHover){el.innerHTML=markup;return;}
  const scrollTop=el.querySelector('.candidate-list')?.scrollTop??0;
  const template=document.createElement('template');template.innerHTML=markup;
  const nextRows=[...template.content.querySelectorAll('.candidate-row')];
  // Keep rows in the same slots stable when other candidates change.
  rows.forEach((row,index)=>{
    const next=nextRows[index];
    if(next&&row.dataset.candidate===next.dataset.candidate){
      row.innerHTML=next.innerHTML;next.replaceWith(row);
    }else if(row===hoverTarget&&!touchPreview.selection)cancelVariation();
  });
  const region=el.querySelector('[data-variation-region]');
  if(region)template.content.querySelector('[data-variation-region]').replaceWith(region);
  el.replaceChildren(template.content);
  const list=el.querySelector('.candidate-list');if(list)list.scrollTop=scrollTop;
}

function renderConnection() {
  const ready=Boolean(session?.ready),analysis=snapshot?.analysis;
  const names={connecting:'连接中',connected:'连接中',restoring:'恢复会话中',ready:'服务已连接',disconnected:'已断线，正在重连', 'connection-error':'服务连接失败', 'session-error':'会话恢复失败','protocol-error':'服务消息格式错误'};
  document.querySelector('#connection-status').textContent=names[connectionStatus]??'尚未连接';
  document.querySelector('#connection-dot').classList.toggle('offline',!ready);
  document.querySelector('#engine-badge').textContent=ready?'实时服务':snapshot?'保留上次快照':'等待连接';
  const statuses={idle:'已暂停',analyzing:'运行中',waiting_workers:'等待算力',memory_limited:'容量受限',finished:'已完成',error:'分析失败'};
  document.querySelector('#analysis-status').textContent=ready?(statuses[analysis?.status]??'待命'):'未连接';
  const descriptions={idle:'点击开始分析，获取当前局面评估',analyzing:'正在分析当前局面',waiting_workers:'暂无可用推理节点，保留最新有效结果',memory_limited:'搜索容量已达限制，已有结果仍可查看',finished:'本轮分析已完成',error:'分析暂不可用'};
  const capacityReasons={
    'configured search depth budget reached':'搜索深度已达上限，已有结果仍可查看',
    'configured search graph or depth budget reached':'搜索节点、内存或深度已达上限，已有结果仍可查看',
    'search graph capacity reached; change position or increase the graph budget to continue':'搜索容量已达上限，落子或切换局面后可继续分析'
  };
  const capacityReason=capacityReasons[analysis?.reason]??analysis?.reason;
  const description=analysis?.status==='memory_limited'&&capacityReason?capacityReason:(descriptions[analysis?.status]??'已连接围棋分析服务');
  document.querySelector('#engine-description').textContent=ready?description:'棋局保留，连接恢复后同步最新状态';
  document.querySelector('#engine-description').title=analysis?.reason??'';
  document.querySelector('#engine-visits').textContent=formatNumber(analysis?.visits??0);
  document.querySelector('#engine-speed').textContent=ready?formatNumber(analysis?.nodesPerSecond??0):'—';
  const active=Boolean(session?.analysisIntent);
  document.querySelector('#analysis-toggle').innerHTML=icon(active?'pause':'play')+'<span>'+(active?'停止分析':'开始分析')+'</span>';
  document.querySelector('#analysis-toggle').setAttribute('aria-label',active?'停止分析':'开始分析');
  document.querySelector('#analysis-toggle').classList.toggle('running',active);
  document.querySelector('#genmove').textContent=genmoveController?'取消 AI 落子':'AI 落子';
  for(const id of ['import','new','pass','clear-board','analysis-toggle'])document.querySelector('#'+id).disabled=!ready||busy;
  document.querySelector('#undo').disabled=!ready||busy||position===0;
  document.querySelector('#genmove').disabled=!ready||(busy&&!genmoveController);
  for(const button of document.querySelectorAll('[data-step],[data-jump],#autoplay'))button.disabled=!ready||busy;
  document.querySelector('#move-slider').disabled=!ready||busy||reviewMoves().length===0;
  for(const point of document.querySelectorAll('[data-index]'))point.setAttribute('aria-disabled',String(!ready||busy));
  for(const button of document.querySelectorAll('[data-candidate]'))button.disabled=!ready||busy;
}

function acceptSnapshot(next) {
  const previous=snapshot;
  sgfReview.acceptSession(next.sessionId);
  if(previous&&previous.sessionId!==next.sessionId)rates.clear();
  const preserveHover=Boolean(previous&&previous.sessionId===next.sessionId&&previous.generation===next.generation&&previous.position===next.position&&previous.toPlay===next.toPlay&&JSON.stringify(previous.board)===JSON.stringify(next.board)&&JSON.stringify(previous.moves)===JSON.stringify(next.moves));
  snapshot=next;moves=next.moves;position=next.position;
  settings={...settings,...next.settings};
  if(!previous||JSON.stringify(previous.moves)!==JSON.stringify(moves))frames=replayFrames(moves);
  frames[position]={board:[...next.board],captures:[next.captures.black,next.captures.white],next:next.toPlay};
  if(Number.isFinite(next.analysis?.root?.winRateBlack))rates.set(positionKey(),next.analysis.root.winRateBlack);
  render(preserveHover);
}

function toast(text) {
  const el=document.querySelector('#toast');el.textContent=text;el.classList.add('visible');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3200);
}
function stop() { clearInterval(timer);timer=null;document.querySelector('#autoplay').innerHTML=icon('play'); }
async function withMutation(action) {
  if(busy)return false;
  if(!session?.ready){toast('服务尚未连接，棋局保持不变');return false;}
  cancelVariation();busy=true;renderConnection();
  try {
    await action();
    return true;
  } catch(error) {
    toast(error.name==='AbortError'?'已取消 AI 落子':error.message);
    return false;
  } finally { busy=false;renderConnection(); }
}
function mutate(type,payload={},options={}) {
  return withMutation(async()=>{
    await session.command(type,payload,options);
    if(type==='new_game'){sgfReview.clear();render();}
  });
}
async function jump(next) {
  next=Math.max(0,Math.min(reviewMoves().length,next));
  const restore=sgfReview.needsRestore(moves);
  if(next===position&&!restore)return true;
  return withMutation(async()=>{
    if(restore)await session.command('set_position',sgfReview.positionPayload());
    if(next!==position)await session.command('seek',{position:next});
  });
}
function autoplay() {
  if(timer){stop();return;}
  const start=async()=>{
    if(!await jump(position>=reviewMoves().length?0:position))return;
    timer=setInterval(async()=>{if(busy)return;if(position>=reviewMoves().length){stop();return;}if(!await jump(position+1))stop();},650);
    document.querySelector('#autoplay').innerHTML=icon('pause');
  };void start();
}
function setMode(next) {
  mode=next;
  document.querySelectorAll('[data-mode]').forEach(button=>{button.classList.toggle('selected',button.dataset.mode===next);button.setAttribute('aria-pressed',String(button.dataset.mode===next));});
  document.querySelectorAll('[data-nav]').forEach(button=>{button.classList.toggle('active',button.dataset.nav===next);button.setAttribute('aria-pressed',String(button.dataset.nav===next));});
  document.querySelector('.breadcrumb strong').textContent=next==='analysis'?'棋局分析':'自由对弈';render();
}
function renderSettings() {
  document.querySelector('#black-player').textContent=settings.black;
  document.querySelector('#white-player').textContent=settings.white;
  document.querySelector('.game-meta').textContent='19 路 · 贴目 '+settings.komi+' · '+(ruleNames[settings.rules]??settings.rules);
}
function dialog(html) { document.querySelector('#dialog').innerHTML=html;document.querySelector('#dialog').showModal(); }

function playTarget(target) {
  playMove(candidateIndex(target.dataset.index??target.dataset.candidate));
}
function playMove(index) {
  stop();
  const next=sgfReview.record&&sgfReview.next(moves,position);
  if(next&&next.index===index&&next.color===frames[position].next){void jump(position+1);return;}
  void mutate('play',{index,color:frames[position].next});
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button,[data-index]');if(!button)return;
  if(button.dataset.index!==undefined||button.dataset.candidate!==undefined)return;
  if(button.dataset.step){stop();void jump({first:0,back:Math.max(0,position-1),forward:Math.min(reviewMoves().length,position+1),last:reviewMoves().length}[button.dataset.step]);}
  if(button.dataset.jump){stop();void jump(Number(button.dataset.jump));}
  if(button.dataset.mode||button.dataset.nav)setMode(button.dataset.mode||button.dataset.nav);
  if(button.dataset.tab)selectAnalysisTab(button);
});
function selectAnalysisTab(button) {
  selectedTab=button.dataset.tab;
  document.querySelectorAll('[data-tab]').forEach(tab=>{
    tab.classList.toggle('active',tab===button);
    tab.setAttribute('aria-selected',String(tab===button));
    tab.tabIndex=tab===button?0:-1;
  });
  renderTab();renderConnection();
}
document.querySelector('.analysis-tabs').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const tabs=[...document.querySelectorAll('[data-tab]')],index=tabs.indexOf(document.activeElement);
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  tabs[next].focus();selectAnalysisTab(tabs[next]);
});
document.querySelector('#board').addEventListener('keydown',event=>{
  if(event.key!=='Enter'&&event.key!==' ')return;
  const target=event.target.closest('[data-index]');
  if(target){event.preventDefault();event.stopPropagation();playTarget(target);}
});
document.querySelector('#autoplay').onclick=autoplay;
document.querySelector('#move-slider').oninput=event=>{
  scrubbing=true;
  event.target.setAttribute('aria-valuetext','第 '+event.target.value+' 手，共 '+reviewMoves().length+' 手');
};
document.querySelector('#move-slider').onchange=async event=>{
  stop();
  await jump(Number(event.target.value));
  scrubbing=false;
  event.target.value=position;
  event.target.setAttribute('aria-valuetext','第 '+position+' 手，共 '+reviewMoves().length+' 手');
};
document.querySelector('#undo').onclick=()=>{stop();void (sgfReview.record?jump(position-1):mutate('undo'));};
document.querySelector('#pass').onclick=()=>playMove(null);
document.querySelector('#clear-board').onclick=async()=>{stop();if(await mutate('new_game',{komi:settings.komi,rules:'chinese'})){rates.clear();render();toast('已清枰，保留双方与规则设置');}};
document.querySelector('#genmove').onclick=async()=>{
  if(genmoveController){genmoveController.abort();return;}
  stop();genmoveController=new AbortController();
  await mutate('genmove',{color:frames[position].next},{signal:genmoveController.signal,timeout:50000});
  genmoveController=null;renderConnection();
};
for(const id of ['candidates','numbers'])document.querySelector('#'+id).onchange=event=>{
  if(id==='candidates')showCandidates=event.target.checked;else showNumbers=event.target.checked;
  saveLocal('yijian-preferences',{showCandidates,showNumbers,candidatePercent});render();
};
document.querySelector('#candidate-percent').oninput=event=>{
  candidatePercent=candidatePercentage(Number(event.target.value));
  saveLocal('yijian-preferences',{showCandidates,showNumbers,candidatePercent});render();
};
function renderCandidateControl() {
  const slider=document.querySelector('#candidate-percent'),total=snapshot?.analysis?.candidates?.length??0;
  slider.value=candidatePercent;
  slider.setAttribute('aria-valuetext',candidatePercent+'%，显示 '+candidates().length+' / '+total+' 个候选点');
  document.querySelector('#candidate-percent-value').textContent=candidatePercent+'%';
  document.querySelector('#candidate-visible-count').textContent='选取 '+candidates().length+' / '+total+' 个';
}
document.querySelector('#candidates').checked=showCandidates;document.querySelector('#numbers').checked=showNumbers;
document.querySelector('#analysis-toggle').onclick=()=>mutate('analyze',{enabled:!session.analysisIntent});
document.querySelector('#new').onclick=()=>dialog('<form id="restart-form"><span class="eyebrow">A NEW BEGINNING</span><h2>重开棋局</h2><div class="game-form"><label>● 执黑方<input name="black" aria-label="执黑方" required maxlength="30" value="'+escapeHTML(settings.black)+'" placeholder="输入玩家名称"></label><button type="button" class="button swap-players" id="swap-players">交换黑白 ⇄</button><label>○ 执白方<input name="white" aria-label="执白方" required maxlength="30" value="'+escapeHTML(settings.white)+'" placeholder="输入玩家名称"></label><div class="rule-fields"><label>贴目<input name="komi" aria-label="贴目" type="number" step="0.5" min="-100" max="100" required value="'+settings.komi+'"></label><label>规则<select name="rules" aria-label="规则"><option value="chinese">中国规则</option></select></label></div></div><p>重开将清空当前棋谱。当前服务支持 19 路中国规则，可手动落子或请求 AI 落子。</p><div class="dialog-actions"><button type="button" class="button" id="cancel-restart">取消</button><button type="submit" class="button primary">开始新棋局</button></div></form>');
document.querySelector('#dialog').addEventListener('click',event=>{
  if(event.target.id==='cancel-restart')document.querySelector('#dialog').close();
  if(event.target.id==='swap-players'){const form=document.querySelector('#restart-form');[form.elements.black.value,form.elements.white.value]=[form.elements.white.value,form.elements.black.value];}
});
document.querySelector('#dialog').addEventListener('submit',async event=>{
  if(event.target.id!=='restart-form')return;event.preventDefault();
  const form=event.target,black=form.elements.black.value.trim(),white=form.elements.white.value.trim();
  if(!black||!white){toast('请填写双方名称');return;}
  stop();
  if(await mutate('new_game',{komi:Number(form.elements.komi.value),rules:'chinese'})){
    settings={...settings,black,white};saveLocal('yijian-players',{black,white});rates.clear();render();
    document.querySelector('#dialog').close();toast('新棋局已开始');
  }
});
document.querySelector('#expand').onclick=()=>{
  const expanded=document.querySelector('.dashboard').classList.toggle('expanded');
  placePlayback();
  document.querySelector('#expand').setAttribute('aria-label',expanded?'恢复布局':'专注棋盘');
  document.querySelector('#expand').setAttribute('aria-pressed',String(expanded));
};
document.querySelector('#settings').onclick=()=>dialog('<form method="dialog"><h2>棋盘偏好</h2><p>复盘区下方可切换候选点与手数；右侧「推荐选点」底部可调整候选点显示比例。显示偏好保存在当前浏览器会话中。</p><p>拖动棋盘与分析栏之间的分隔线可调整宽度，双击恢复默认。点击棋盘右上角可进入专注模式。</p><button class="button primary">知道了</button></form>');
document.querySelector('#help').onclick=event=>{
  event.preventDefault();dialog('<form method="dialog"><h2>欢迎来到弈间</h2><p>分析模式：鼠标悬停候选点看变化、单击落子；触屏点一次预览，再点同一点落子，点其他位置切换预览。自由对弈直接点按落子。</p><p>方向键逐手复盘，空格自动播放。导入 SGF 后从空枰开始，橙色圆环提示下一手；点中该落点等同下一步，点其他位置可试下，回退或播放会返回原谱。未导入棋谱时，在历史位置落子会替换后续记录。变化预览只读取已有搜索结果。</p><p>SGF 导入支持 19 路中国规则、无摆子、无分支的交替落子棋谱。短暂断线后会恢复服务会话；请导出 SGF 长期保存。</p><button class="button primary">开始探索</button></form>');
};
document.querySelector('#export').onclick=()=>{
  const sgf=exportSGF(reviewMoves(),{...settings,rules:'Chinese'});
  const url=URL.createObjectURL(new Blob([sgf],{type:'application/x-go-sgf'})),link=document.createElement('a');
  link.href=url;link.download='弈间-棋局.sgf';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('棋谱已导出');
};
document.querySelector('#import').onclick=()=>document.querySelector('#file').click();
document.querySelector('#file').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try{
    const imported=parseSGF(await file.text());stop();
    if(await withMutation(async()=>{
      await session.command('set_position',{boardSize:19,moves:imported.moves,komi:imported.settings.komi,rules:'chinese'});
      sgfReview.load(snapshot.sessionId,imported);
      settings={...settings,black:imported.settings.black,white:imported.settings.white};
      saveLocal('yijian-players',{black:settings.black,white:settings.white});rates.clear();render();
      if(position!==0){
        try { await session.command('seek',{position:0}); }
        catch(error) { throw new Error('棋谱已导入，但回到开局失败：'+error.message+'；请点击“回到开局”重试'); }
      }
    }))toast('已导入 '+moves.length+' 手棋谱，已回到开局');
  }catch(error){toast(error.message);}finally{event.target.value='';}
};

let variationMarkup=null;
const variationHover=createVariationHover({
  onPending:({refreshing})=>{if(!refreshing)setVariationStatus('正在读取已有变化…');},
  onResult:(result,payload)=>{
    if(payload.generation!==snapshot?.generation)return;
    if(result.available===false){restoreVariationBoard();setVariationStatus('当前搜索图暂无该点的后续变化');return;}
    try{
      const preview=previewVariation(payload.board,payload.toPlay,result.moves,payload.candidate);
      document.querySelector('#position-stones').setAttribute('visibility','hidden');
      document.querySelector('#candidate-markers').setAttribute('visibility','hidden');
      document.querySelector('#next-move-marker').setAttribute('visibility','hidden');
      document.querySelector('#hover-stone').setAttribute('visibility','hidden');
      const markup=stoneMarkup(preview.board,new Map(preview.stones.map(move=>[move.index,move.number])));
      if(markup!==variationMarkup){
        document.querySelector('#variation-overlay').innerHTML=markup;
        variationMarkup=markup;
      }
      setVariationStatus(result.moves.length?result.moves.map((move,index)=>(index+1)+'. '+(move.color===1?'●':'○')+' '+pointLabel(move.index)).join(' → '):'暂无后续变化');
    }catch(error){setVariationStatus(error.message);}
  },
  onError:error=>setVariationStatus(error.message||'变化加载失败，正在重试')
});
function variationHint() { return touchInput?'点一次看变化，再点同一点落子；预览保留至退出。':'悬停候选点看变化，单击落子；移开鼠标结束预览。'; }
function variationIdleHint() { return touchInput?'点选位置，预览已有变化':'悬停候选点，预览已有变化'; }
function renderInputHints() {
  document.querySelector('#board-input-hint').textContent=mode==='play'?'点按交叉点落子':touchInput?'点一次看变化 · 再点同一点落子':'悬停候选点看变化 · 单击落子';
  const hint=document.querySelector('#variation-hint');if(hint)hint.textContent=variationHint();
}
function setVariationStatus(text) {
  for(const id of ['variation-status','touch-preview-status']){
    const el=document.querySelector('#'+id);if(el&&el.textContent!==text)el.textContent=text;
  }
}
function restoreVariationBoard() {
  variationMarkup=null;
  document.querySelector('#variation-overlay')?.replaceChildren();
  document.querySelector('#position-stones')?.removeAttribute('visibility');
  document.querySelector('#candidate-markers')?.removeAttribute('visibility');
  document.querySelector('#next-move-marker')?.removeAttribute('visibility');
}
function clearVariation() {
  variationHover.cancel();hoverTarget=null;
  restoreVariationBoard();
  document.querySelector('#touch-preview').hidden=true;
  document.querySelector('#touch-selection')?.setAttribute('visibility','hidden');
  document.querySelector('#hover-stone')?.setAttribute('visibility','hidden');
  setVariationStatus(variationIdleHint());
}
function cancelVariation() { touchPreview.reset();clearVariation(); }
function getVariationTarget(target) {
  if(!(target instanceof Element)||mode!=='analysis'||!session?.ready||busy||!candidates().length)return null;
  const row=target.closest('[data-candidate]');if(row)return row;
  const region=target.closest('[data-variation-region]');if(region)return region;
  const point=target.closest('[data-index]');
  return point&&showCandidates&&candidateList().includes(Number(point.dataset.index))?point:null;
}
function beginVariation(target) {
  if(!target||target===hoverTarget)return;
  cancelVariation();hoverTarget=target;
  const raw=target.dataset.candidate??target.dataset.index;
  const candidate=raw===undefined?candidates()[0].index:candidateIndex(raw),frame=frames[position];
  variationHover.schedule({board:[...frame.board],toPlay:frame.next,candidate,generation:snapshot.generation});
}
const inputContext=()=>snapshot?snapshot.sessionId+':'+snapshot.generation+':'+snapshot.position+':'+mode:null;
const targetIndex=target=>candidateIndex(target.dataset.index??target.dataset.candidate);
const touchPreview=createTouchPreview({
  activate:playTarget,
  getContext:inputContext,
  getKey:targetIndex,
  canPreview:target=>mode==='analysis'&&session?.ready&&!busy&&(targetIndex(target)===null||!frames[position].board[targetIndex(target)]),
  preview:target=>{
    stop();clearVariation();
    const candidate=targetIndex(target),frame=frames[position];
    document.querySelector('#touch-preview').hidden=false;
    document.querySelector('#touch-preview-target').textContent='预览 '+pointLabel(candidate);
    if(candidate!==null){
      const marker=document.querySelector('#touch-selection');
      marker.setAttribute('cx',42+candidate%19*32);marker.setAttribute('cy',42+Math.floor(candidate/19)*32);marker.removeAttribute('visibility');
    }
    setVariationStatus('正在读取已有变化…');
    variationHover.schedule({board:[...frame.board],toPlay:frame.next,candidate,generation:snapshot.generation},{immediate:true});
  },
});
document.querySelector('#exit-preview').onclick=cancelVariation;
const hasPointerEvents=typeof window.PointerEvent==='function';
const fromMouse=event=>!event.pointerType||event.pointerType==='mouse';
document.addEventListener(hasPointerEvents?'pointerover':'mouseover',event=>{
  if(fromMouse(event)&&!touchPreview.selection)beginVariation(getVariationTarget(event.target));
});
document.addEventListener(hasPointerEvents?'pointerout':'mouseout',event=>{if(fromMouse(event)&&!touchPreview.selection&&hoverTarget&&hoverTarget.contains(event.target)&&!hoverTarget.contains(event.relatedTarget))cancelVariation();});
document.querySelector('#board').addEventListener(hasPointerEvents?'pointermove':'mousemove',event=>{
  if(!fromMouse(event)||touchPreview.selection)return;
  const point=event.target.closest('[data-index]'),ghost=document.querySelector('#hover-stone');
  if(!point||!session?.ready||busy||frames[position].board[Number(point.dataset.index)]||document.querySelector('#variation-overlay').childNodes.length){ghost.setAttribute('visibility','hidden');return;}
  const index=Number(point.dataset.index);ghost.setAttribute('cx',42+index%19*32);ghost.setAttribute('cy',42+Math.floor(index/19)*32);ghost.setAttribute('visibility','visible');
});
document.querySelector('#board').addEventListener(hasPointerEvents?'pointerleave':'mouseleave',()=>document.querySelector('#hover-stone').setAttribute('visibility','hidden'));
setupBoardInput(document,{
  activate:target=>{touchInput=false;renderInputHints();playTarget(target);},
  tap:target=>{touchInput=true;renderInputHints();touchPreview.tap(target);},
  getContext:inputContext,
  pointerEvents:hasPointerEvents,
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape')cancelVariation();
  if(document.querySelector('dialog[open]')||['INPUT','BUTTON','SELECT','TEXTAREA'].includes(document.activeElement.tagName)||!session?.ready)return;
  if(event.code==='Space'){event.preventDefault();autoplay();}
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();stop();void jump(Math.max(0,Math.min(reviewMoves().length,position+(event.key==='ArrowRight'?1:-1))));}
});
session=new EngineSession({url:endpoint,storage,onSnapshot:acceptSnapshot,onNotice:toast,onStatus:status=>{
  connectionStatus=status;
  if(status!=='ready'&&status!=='connected'){cancelVariation();stop();}
  renderConnection();
}});
configureVariationProvider((payload,{signal})=>session.variation(payload.candidate,{signal}));
render();session.connect();
window.addEventListener('pagehide',()=>{cancelVariation();stop();session.close();});
window.addEventListener('pageshow',event=>{if(event.persisted)session.connect();});
