
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, remove, push, onDisconnect, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey:"AIzaSyDYrmf-ThU5x0SQBdEvUy5k83LyTXxhgFA",
  authDomain:"undercover-game-b0d2a.firebaseapp.com",
  databaseURL:"https://undercover-game-b0d2a-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:"undercover-game-b0d2a",
  storageBucket:"undercover-game-b0d2a.firebasestorage.app",
  messagingSenderId:"195280531653",
  appId:"1:195280531653:web:94d72b25760b05af6bc0ac"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const PLAYER_COLORS = ['#38bdf8','#fbbf24','#f97316','#a78bfa','#34d399','#fb7185','#22d3ee','#f472b6'];
const START_CASH = 1500;
const AUCTION_DURATION = 20;
const TRADE_DURATION = 30;
const START_INDEX = 21;      // index de la case Depart dans BOARD
const START_BONUS = 200;
const WIN_NET_WORTH = 3000;  // valeur nette a atteindre pour gagner
const MAX_ROUNDS = 34;       // nombre de manches maximum
const TURN_GRACE_MS = 1500;  // tolerance avant de passer un tour expire
const BOARD = [
  {id:'chance',name:'Chance',type:'chance'},
  {id:'jakarta',name:'Jakarta',type:'property',price:170,rent:17,group:'Pink'},
  {id:'berlin',name:'Berlin',type:'property',price:20,rent:2,group:'Pink'},
  {id:'moscow',name:'Moscow',type:'property',price:560,rent:56,group:'Orange'},
  {id:'railway',name:'Railway',type:'station',price:200,group:'Railways'},
  {id:'toronto',name:'Toronto',type:'property',price:290,rent:29,group:'Orange'},
  {id:'seoul',name:'Seoul',type:'property',price:560,rent:56,group:'Orange'},
  {id:'jail',name:'Jail',type:'jail'},
  {id:'zurich',name:'Zurich',type:'property',price:250,rent:25,group:'Green'},
  {id:'riyadh',name:'Riyadh',type:'property',price:35,rent:4,group:'Yellow'},
  {id:'sydney',name:'Sydney',type:'property',price:40,rent:4,group:'Blue'},
  {id:'event-right',name:'Event',type:'event'},
  {id:'beijing',name:'Beijing',type:'property',price:300,rent:30,group:'Brown'},
  {id:'dubai',name:'Dubai',type:'property',price:40,rent:4,group:'Brown'},
  {id:'auction',name:'Auction',type:'event'},
  {id:'paris',name:'Paris',type:'property',price:350,rent:35,group:'Purple'},
  {id:'hong-kong',name:'Hong Kong',type:'property',price:50,rent:5,group:'Purple'},
  {id:'london',name:'London',type:'property',price:70,rent:7,group:'Red'},
  {id:'airport',name:'Airport',type:'airport',price:200,group:'Airports'},
  {id:'tokyo',name:'Tokyo',type:'property',price:420,rent:42,group:'Red'},
  {id:'new-york',name:'New York',type:'property',price:110,rent:11,group:'Red'},
  {id:'start',name:'Start',type:'start',label:'+200'},
  {id:'rio',name:'Rio',type:'property',price:110,rent:11,group:'Green'},
  {id:'delhi',name:'Delhi',type:'property',price:110,rent:11,group:'Green'},
  {id:'event-left',name:'Event',type:'event'},
  {id:'boat',name:'Boat',type:'station',price:150,group:'Railways'},
  {id:'cairo',name:'Cairo',type:'property',price:50,rent:5,group:'Blue'},
  {id:'madrid',name:'Madrid',type:'property',price:100,rent:10,group:'Blue'}
];

const GROUP_COLORS = {
  Pink:'#ad3e6a',Orange:'#f29300',Railways:'#f2f4ef',Green:'#90bb47',Yellow:'#f2c31a',Brown:'#a95c22',Purple:'#6e3dbb',Red:'#ef553f',Airports:'#f2f4ef',Blue:'#58b5f8'
};

// Couleur de reference case par case (capture fournie). Le bandeau porte la couleur,
// le corps de la case reste clair : le nom et le prix restent lisibles partout.
const SQUARE_COLORS = {
  start:'#D5D7D8','new-york':'#F1564A',tokyo:'#F47A32',airport:'#F5C94A',london:'#F26A3D','hong-kong':'#8B5CC7',paris:'#7446C4',
  auction:'#F6C62F',dubai:'#A86429',beijing:'#C9782B',sydney:'#36A9E1',riyadh:'#7ACB3A',zurich:'#48B08C',jail:'#C7CDD0',
  seoul:'#EF728C',toronto:'#EE7185',railway:'#9AA4A8',moscow:'#F28C22',berlin:'#C63C75',jakarta:'#D8658B',chance:'#B8BDC1',
  madrid:'#58B7F2',cairo:'#55C7F0',boat:'#9BA6AA','event-left':'#F5C63B','event-right':'#F5C63B',delhi:'#86BF45',rio:'#79BF45'
};

function getSquareColor(square){return SQUARE_COLORS[square.id] || getColorForGroup(square.group) || '#D5D7D8';}

// Encre du prix : on retient celle qui offre le meilleur contraste WCAG reel sur le bandeau.
const INK_DARK='#1D242C', INK_LIGHT='#FFFFFF';

function relativeLuminance(color){
  const channels=[1,3,5].map(i=>{
    const u=parseInt(color.slice(i,i+2),16)/255;
    return u<=0.03928 ? u/12.92 : Math.pow((u+0.055)/1.055,2.4);
  });
  return 0.2126*channels[0] + 0.7152*channels[1] + 0.0722*channels[2];
}

function contrastRatio(a,b){
  const l1=relativeLuminance(a), l2=relativeLuminance(b);
  return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
}

function readableInk(color){
  if(!color || color.charAt(0)!=='#' || color.length!==7) return INK_DARK;
  return contrastRatio(INK_DARK,color) >= contrastRatio(INK_LIGHT,color) ? INK_DARK : INK_LIGHT;
}

function squarePriceText(square){
  if(square.type==='property'||square.type==='station'||square.type==='airport') return '$'+square.price;
  if(square.type==='tax') return '-$'+(square.amount||0);
  return '';
}

function squareLabelText(square){
  return square.type==='start'?'DÉPART':square.type==='jail'?'PRISON':square.type==='free'?'LIBRE'
    :square.type==='tax'?'IMPÔT':square.type==='event'?'ÉVÈNEMENT':square.type==='chance'?'CHANCE'
    :square.type.toUpperCase();
}

  function getColorForGroup(group){if(!group) return null; if(GROUP_COLORS[group]) return GROUP_COLORS[group]; const hash=Array.from(String(group)).reduce((a,c)=>a + c.charCodeAt(0),0); const h = hash % 360; return `hsl(${h} 72% 50%)`; }

let myCode = null;
let myName = null;
let myPlayerId = null;
let myColor = null;
let isHost = false;
let currentGame = null;
let gameListener = null;
let boardNodes = [];
let countdownTimer = null;
let auctionTimer = null;
let watchdogTimer = null;
let rolling = false;
// Verrous locaux : une resolution ecrit dans l'historique, ce qui relance
// renderState avant que l'etat ne soit propage. Sans eux, la resolution boucle.
let resolvedAuctionKey = null;
let resolvedTradeKey = null;
let finishedKey = null;
let enforcedDeadline = null;

function show(id){document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));document.getElementById(id).classList.add('active');}
function toast(message){const toastEl=document.createElement('div');toastEl.textContent=message;toastEl.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(20,28,42,0.95);color:#f8d68d;padding:12px 18px;border-radius:999px;z-index:60;opacity:0;transition:opacity 0.18s';document.body.appendChild(toastEl);requestAnimationFrame(()=>toastEl.style.opacity='1');setTimeout(()=>{toastEl.style.opacity='0';setTimeout(()=>toastEl.remove(),250);},2400);}

function genCode(){const words=['ROLL','BANK','VALE','LIFT','NOVA','PLAZA','CASH','LOOP','ARCO','MINT'];return words[Math.floor(Math.random()*words.length)]+'-'+Math.floor(10+Math.random()*90);}
function makeId(){return Math.random().toString(36).slice(2,10);}
function esc(value){return String(value===undefined||value===null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function initial(name){const s=String(name||'?').trim();return esc((s[0]||'?').toUpperCase());}
function netWorth(game,player){if(!player) return 0;let total=player.cash||0;Object.entries((game&&game.ownership)||{}).forEach(([pos,owner])=>{if(owner===player.id) total+=(BOARD[pos]&&BOARD[pos].price)||0;});return total;}
function bestPlayer(game){return [...((game&&game.players)||[])].sort((a,b)=>netWorth(game,b)-netWorth(game,a))[0]||null;}
function crossesStart(from,total){const steps=(START_INDEX-from+BOARD.length)%BOARD.length;return steps>0&&steps<=total;}
function parseStored(){myCode=localStorage.getItem('banqueroll-code');myPlayerId=localStorage.getItem('banqueroll-playerId');myName=localStorage.getItem('banqueroll-name');myColor=localStorage.getItem('banqueroll-color');}
function saveLocal(){localStorage.setItem('banqueroll-code',myCode);localStorage.setItem('banqueroll-playerId',myPlayerId);localStorage.setItem('banqueroll-name',myName);localStorage.setItem('banqueroll-color',myColor);}
function clearLocal(){localStorage.removeItem('banqueroll-code');localStorage.removeItem('banqueroll-playerId');localStorage.removeItem('banqueroll-name');localStorage.removeItem('banqueroll-color');}

function boardLayout(){const layout=[];for(let c=1;c<=8;c++)layout.push({r:1,c});for(let r=2;r<=7;r++)layout.push({r,c:8});for(let c=8;c>=1;c--)layout.push({r:8,c});for(let r=7;r>=2;r--)layout.push({r,c:1});return layout;}
const BOARD_LAYOUT = boardLayout();

function initBoard(){
  const grid=document.getElementById('board-grid');
  // Le centre du plateau est statique dans le HTML (messages, dés, panneau d'action) :
  // on ne vide que les cases pour ne pas le détruire.
  grid.querySelectorAll('.square').forEach(node=>node.remove());
  boardNodes=[];
  BOARD.forEach((square,index)=>{
    const coords=BOARD_LAYOUT[index]||{r:1,c:1};
    const node=document.createElement('div');
    node.className='square '+square.type;
    node.dataset.index=index;
    node.style.gridRowStart=coords.r;
    node.style.gridColumnStart=coords.c;
    const color=getSquareColor(square);
    node.style.setProperty('--sq',color);
    node.style.setProperty('--sq-ink',readableInk(color));
    node.innerHTML=`<div class="square-band"></div><div class="square-price">${squarePriceText(square)}</div><div class="square-top"><span class="square-name">${esc(square.name)}</span><span class="square-label">${squareLabelText(square)}</span></div><div class="pawn-container"></div>`;
    grid.appendChild(node);
    boardNodes.push(node);
  });
}



function getGameRef(code){return ref(db,`banqueroll/${code}`);} 
function getPresenceRef(code,playerId){return ref(db,`banqueroll/${code}/presence/${playerId}`);} 

async function freeCode(){for(let attempt=0;attempt<12;attempt++){const candidate=genCode();const snap=await get(getGameRef(candidate));if(!snap.exists()) return candidate;}return genCode()+'-'+makeId().slice(0,3);}

async function createGame(){const name=document.getElementById('create-name').value.trim();const players=parseInt(document.getElementById('create-players').value,10);const timer=parseInt(document.getElementById('create-timer').value,10);const err=document.getElementById('create-error');err.textContent='';if(!name){err.textContent='Entre ton prénom.';return;}if(players<2||players>8){err.textContent='Choisis entre 2 et 8 joueurs.';return;}myCode=await freeCode();myPlayerId=makeId();myName=name;myColor=PLAYER_COLORS[0];isHost=true;saveLocal();const player={id:myPlayerId,name,position:START_INDEX,cash:START_CASH,jailTurns:0,inJail:false,color:myColor,ready:true};const game={code:myCode,hostId:myPlayerId,maxPlayers:players,turnTimer:timer,players:[player],phase:'lobby',turnIndex:0,round:1,currentAction:null,ownership:{},auction:null,trade:null,winnerId:null,turnDeadline:null,createdAt:Date.now(),updatedAt:Date.now()};await set(getGameRef(myCode),game);attachPresence();startGameListener(myCode);renderLobby(game);show('s-lobby');}

// Deux joueurs qui rejoignaient en meme temps s'ecrasaient mutuellement :
// l'ajout dans le tableau players passe desormais par une transaction.
async function joinGame(){
  const code=document.getElementById('join-code').value.trim().toUpperCase();
  const name=document.getElementById('join-name').value.trim();
  const err=document.getElementById('join-error');err.textContent='';
  if(!code){err.textContent='Entre le code de la partie.';return;}
  if(!name){err.textContent='Entre ton prénom.';return;}
  show('s-joining');
  const gameRef=getGameRef(code);
  // Un listener actif amorce le cache local : sans lui, runTransaction demarre
  // avec current===null et la transaction s'annule immediatement.
  let detach=null;
  const snap=await new Promise(resolve=>{detach=onValue(gameRef,s=>resolve(s),()=>resolve(null));});
  if(!snap||!snap.exists()){if(detach) detach();err.textContent='Code introuvable.';show('s-home');return;}
  const newId=makeId();
  let outcome=null;
  try{
  await runTransaction(gameRef,current=>{
    outcome=null;
    if(!current){outcome={error:'Code introuvable.'};return;}
    if(current.phase!=='lobby'){outcome={error:'La partie est déjà lancée.'};return;}
    const players=current.players||[];
    const existing=players.find(p=>p.name&&p.name.toLowerCase()===name.toLowerCase());
    if(existing){outcome={player:existing,hostId:current.hostId};return;}
    if(players.length>=current.maxPlayers){outcome={error:'La partie est complète.'};return;}
    const player={id:newId,name,position:START_INDEX,cash:START_CASH,jailTurns:0,inJail:false,color:PLAYER_COLORS[players.length%PLAYER_COLORS.length],ready:true};
    outcome={player,hostId:current.hostId};
    current.players=[...players,player];
    current.updatedAt=Date.now();
    return current;
  });
  } finally { if(detach) detach(); }
  if(!outcome||outcome.error){err.textContent=(outcome&&outcome.error)||'Impossible de rejoindre la partie.';show('s-home');return;}
  myCode=code;myPlayerId=outcome.player.id;myName=outcome.player.name;myColor=outcome.player.color;
  isHost=outcome.hostId===myPlayerId;
  saveLocal();attachPresence();startGameListener(code);
}

function attachPresence(){if(!myCode||!myPlayerId) return;const presRef=getPresenceRef(myCode,myPlayerId);set(presRef,{name:myName,ts:Date.now()});onDisconnect(presRef).remove();}

function startGameListener(code){stopGameListener();gameListener = onValue(getGameRef(code), snap => {if(!snap.exists()){toast('La partie a été supprimée.');stopGameListener();clearLocal();currentGame=null;show('s-home');return;}const game=snap.val();currentGame=game;renderState(game);});startWatchdog();}

function stopGameListener(){if(gameListener){gameListener();gameListener=null;}if(watchdogTimer){clearInterval(watchdogTimer);watchdogTimer=null;}}

// Quitter proprement : sans detacher le listener, le prochain onValue reaffichait s-game.
function resetGuards(){resolvedAuctionKey=null;resolvedTradeKey=null;finishedKey=null;enforcedDeadline=null;rolling=false;}

function toggleDrawer(force){const drawer=document.getElementById('drawer');if(!drawer) return;if(force===undefined) drawer.classList.toggle('mobile-open');else drawer.classList.toggle('mobile-open',!!force);}

function leaveGame(){stopGameListener();resetGuards();toggleDrawer(false);if(myCode&&myPlayerId) remove(getPresenceRef(myCode,myPlayerId));if(countdownTimer) clearInterval(countdownTimer);if(auctionTimer) clearInterval(auctionTimer);closeAuctionModal();closeTradeModal();currentGame=null;clearLocal();myCode=null;myPlayerId=null;myName=null;myColor=null;isHost=false;rolling=false;show('s-home');}

function renderState(game){document.getElementById('stat-players').textContent=`${game.players.length} / ${game.maxPlayers}`;document.getElementById('stat-pot').textContent=`${game.players.reduce((sum,p)=>sum+(p.cash||0),0)} 💰`;renderObjective(game);renderChat(game);renderHistory(game);renderPlayers(game);renderBoard(game);if(game.phase==='lobby'){renderLobby(game);renderAction(game);if(!document.getElementById('s-lobby').classList.contains('active')) show('s-lobby');}else{renderAction(game);show('s-game');}if(game.auction && game.auction.status==='open'){openAuctionModal(game.auction);}else{closeAuctionModal();}maybeResolveAuction(game);maybeResolveTradeTimeout(game);maybeFinishGame(game);}

function renderObjective(game){const el=document.getElementById('ref-objective');if(!el) return;if(game.phase==='lobby'){el.innerHTML=`Salon &middot; <strong>${game.players.length}/${game.maxPlayers}</strong> joueurs`;return;}if(game.phase==='finished'){const win=findPlayerById(game.winnerId);el.innerHTML=`Partie terminée &middot; <strong>${esc(win?win.name:'—')}</strong>`;return;}const roundsLeft=Math.max(0,MAX_ROUNDS-((game.round||1)-1));el.innerHTML=`<strong>$${WIN_NET_WORTH}</strong> de valeur nette pour gagner. Manches restantes : <strong>${roundsLeft}</strong>`;}

function renderLobby(game){document.getElementById('lobby-code').textContent=game.code;const container=document.getElementById('lobby-players');container.innerHTML='';game.players.forEach((player,index)=>{const card=document.createElement('div');card.className='player-card'+(player.id===myPlayerId?' current':'');card.innerHTML=`<div class="player-meta"><span class="player-name">${esc(player.name)}</span><span class="player-sub">${player.id===game.hostId?'Hôte':''}</span></div><div class="player-chip" style="background:${esc(player.color)};">${initial(player.name)}</div>`;container.appendChild(card);});const canStart = isHost && game.players.length >= 2;document.getElementById('start-game-btn').disabled = !canStart;}

function openAuctionModal(auction){auction=auction||(currentGame&&currentGame.auction);if(!auction||auction.status!=='open') return;const modal=document.getElementById('modal-auction');modal.classList.add('active');const details=document.getElementById('auction-details');const item=BOARD[auction.position];const bidder=findPlayerById(auction.highestBidder);const owner=bidder?bidder.name:'aucun';details.textContent=`${item.name} est en vente. Mise minimale : ${auction.nextBid} 💰. Meilleure offre actuelle : ${auction.highestBid || 0} par ${owner}.`;const bidInput=document.getElementById('auction-bid');if(document.activeElement!==bidInput) bidInput.value=auction.nextBid;updateAuctionCountdown(auction);} 
function closeAuctionModal(){document.getElementById('modal-auction').classList.remove('active');}

function openTradeModal(){populateTradeOptions();document.getElementById('trade-error').textContent='';document.getElementById('modal-trade').classList.add('active');}
function closeTradeModal(){document.getElementById('modal-trade').classList.remove('active');}

function populateTradeOptions(){const recipient=document.getElementById('trade-recipient');const offerProp=document.getElementById('trade-offer-property');const requestProp=document.getElementById('trade-request-property');recipient.innerHTML='';offerProp.innerHTML='<option value="">Aucune</option>';requestProp.innerHTML='<option value="">Aucune</option>';const others=currentGame.players.filter(p=>p.id!==myPlayerId);others.forEach(player=>recipient.insertAdjacentHTML('beforeend',`<option value="${player.id}">${player.name}</option>`));const myProps=getOwnedProperties(myPlayerId);myProps.forEach(pos=>offerProp.insertAdjacentHTML('beforeend',`<option value="${pos}">${BOARD[pos].name}</option>`));const allProps=currentGame.players.filter(p=>p.id!==myPlayerId).flatMap(p=>getOwnedProperties(p.id).map(pos=>({pos,player:p})));allProps.forEach(item=>requestProp.insertAdjacentHTML('beforeend',`<option value="${item.pos}">${item.player.name} • ${BOARD[item.pos].name}</option>`));}

function findPlayerById(id){if(!id||!currentGame||!currentGame.players) return null;return currentGame.players.find(p=>p.id===id)||null;} 
function getOwnedProperties(playerId){return Object.entries(currentGame.ownership||{}).filter(([,owner])=>owner===playerId).map(([pos])=>Number(pos));}

function renderPlayers(game){const panel=document.getElementById('players-panel');if(!panel) return;panel.innerHTML='';const playersList=document.createElement('div');playersList.className='player-list';game.players.forEach((player,index)=>{const card=document.createElement('div');card.className='player-card'+(game.turnIndex===index?' current':'');card.innerHTML=`<div class="player-meta"><span class="player-name">${esc(player.name)}${player.id===game.hostId?' • Hôte':''}</span><span class="player-sub">${player.cash} 💰 • net ${netWorth(game,player)}${player.inJail?' • En prison':''}${player.jailTurns?' • '+player.jailTurns+' tour'+(player.jailTurns>1?'s':''):''}</span></div><div class="player-chip" style="background:${esc(player.color)};">${initial(player.name)}</div>`;playersList.appendChild(card);});panel.innerHTML='<h3>Tableau des joueurs</h3>';panel.appendChild(playersList);renderReferencePlayers(game);}

function renderReferencePlayers(game){
  const build=(players)=>players.map(player=>{
    const index=game.players.indexOf(player);
    const active=game.phase==='playing' && game.turnIndex===index;
    const status=player.inJail?'En prison':(player.id===game.hostId?'Hôte':'');
    return `<div class="reference-player${active?' current':''}">`
      + `<span class="player-avatar" style="background:${esc(player.color)}">${initial(player.name)}</span>`
      + `<span class="player-copy"><strong>${esc(player.name)}</strong>`
      + `<small>$${player.cash} <em>($${netWorth(game,player)})</em></small>`
      + (status?`<small>${status}</small>`:'')
      + `</span></div>`;
  }).join('');
  const split=Math.ceil(game.players.length/2);
  const top=document.getElementById('players-top');
  const bottom=document.getElementById('players-bottom');
  if(top) top.innerHTML=build(game.players.slice(0,split));
  if(bottom) bottom.innerHTML=build(game.players.slice(split));
}

function renderChat(game){const chatList=document.getElementById('chat-list');if(!chatList) return;chatList.innerHTML='';const messages=game.chat?Object.values(game.chat).sort((a,b)=>a.ts-b.ts):[];messages.slice(-20).forEach(msg=>{const line=document.createElement('div');line.className='chat-item';line.innerHTML=`<strong>${esc(msg.author)}</strong><span>${esc(msg.text)}</span>`;chatList.appendChild(line);});chatList.scrollTop=chatList.scrollHeight;const last=messages[messages.length-1];const lastEl=document.getElementById('ref-chat-last');const countEl=document.getElementById('ref-chat-count');if(lastEl) lastEl.textContent=last?`${last.author} : ${last.text}`:'Aucun message';if(countEl) countEl.textContent=`${messages.length} message${messages.length>1?'s':''}`;}

function renderHistory(game){const historyList=document.getElementById('history-list');if(!historyList) return;historyList.innerHTML='';const events=game.history?Object.values(game.history).sort((a,b)=>a.ts-b.ts):[];events.slice(-18).reverse().forEach(item=>{const el=document.createElement('div');el.className='history-item';el.textContent=item.text;historyList.appendChild(el);});const message=document.getElementById('event-message');if(message){const latest=events[events.length-1];message.textContent=latest?latest.text:(game.phase==='lobby'?'En attente du lancement…':'La partie va commencer…');}}

function renderBoard(game){if(!boardNodes.length) initBoard();boardNodes.forEach((node,index)=>{const square=BOARD[index];node.className='square '+square.type;const ownerId=game.ownership?.[index]||null;const owner=findPlayerById(ownerId);node.querySelector('.square-name').textContent=square.name;node.querySelector('.square-label').textContent=squareLabelText(square);node.querySelector('.square-price').textContent=squarePriceText(square);const pawnContainer=node.querySelector('.pawn-container');pawnContainer.innerHTML='';const occupants=game.players.filter(p=>p.position===index);occupants.forEach(p=>{const pawn=document.createElement('div');pawn.className='pawn';pawn.style.background=p.color;pawn.title=p.name;pawn.textContent=String(p.name||'?').charAt(0).toUpperCase();pawnContainer.appendChild(pawn);});let ownerPill=node.querySelector('.owner-pill');if(ownerId&&owner){if(!ownerPill){ownerPill=document.createElement('div');ownerPill.className='owner-pill';node.appendChild(ownerPill);}ownerPill.textContent=owner.name;ownerPill.title='Propriété de '+owner.name;ownerPill.style.background=owner.color;}else if(ownerPill){ownerPill.remove();}if(game.turnIndex!==undefined && game.players[game.turnIndex]?.position===index){node.classList.add('current');} else node.classList.remove('current');});}

function renderAction(game){clearInterval(countdownTimer);const turnName=document.getElementById('turn-player');const turnStatus=document.getElementById('turn-status');const result=document.getElementById('roll-result');const deadline=game.turnDeadline?Math.max(0,Math.round((game.turnDeadline-Date.now())/1000)):0;turnName.textContent=`${game.players[game.turnIndex]?.name || '...'} (${game.players.length} joueurs)`;turnStatus.textContent=game.phase==='playing'?'En cours':game.phase==='finished'?'Terminée':'Salon';result.textContent=game.currentAction?`Action en attente: ${game.currentAction.type}`:'Prêt à jouer';renderTimer(deadline);const panel=document.getElementById('action-panel');panel.innerHTML='';if(game.phase==='lobby'){const box=document.createElement('div');box.className='action-box';box.innerHTML=`<div class="action-title">Salon</div><div class="action-text">Attends que l'hôte démarre la partie. Le code de la partie est <strong>${game.code}</strong>.</div>`;panel.appendChild(box);return;}if(game.phase==='finished'){const win=findPlayerById(game.winnerId);const box=document.createElement('div');box.className='action-box';box.innerHTML=`<div class="action-title">Partie terminée</div><div class="action-text"><strong>${esc(win?win.name:'Personne')}</strong> remporte la partie avec <strong>${win?netWorth(game,win):0} 💰</strong> de valeur nette.</div><div class="action-buttons">${isHost?'<button class="btn btn-primary" onclick="restartGame()">Nouvelle partie</button>':''}<button class="btn btn-secondary" onclick="leaveGame()">Quitter</button></div>`;panel.appendChild(box);return;}const currentPlayer=game.players[game.turnIndex];const isMyTurn=currentPlayer?.id===myPlayerId;const title=game.currentAction?`Action requise`:'À ton tour';const textEl=document.createElement('div');textEl.className='action-box';let html='';if(game.trade && game.trade.status==='pending' && [game.trade.fromId,game.trade.toId].includes(myPlayerId)){const offerPlayer=findPlayerById(game.trade.fromId)||{name:'?'};const targetPlayer=findPlayerById(game.trade.toId)||{name:'?'};const offerItem=game.trade.offerProperty?BOARD[game.trade.offerProperty].name:'Aucun';const requestItem=game.trade.requestProperty?BOARD[game.trade.requestProperty].name:'Aucun';html=`<div class="action-title">Échange proposé</div><div class="action-text"><strong>${esc(offerPlayer.name)}</strong> propose ${game.trade.offerCash} 💰 et ${offerItem} contre ${game.trade.requestCash} 💰 et ${requestItem} de <strong>${esc(targetPlayer.name)}</strong>.</div>`;if(myPlayerId===game.trade.toId){html+=`<div class="action-buttons"><button class="btn btn-primary" onclick="acceptTrade()">Accepter</button><button class="btn btn-secondary" onclick="declineTrade()">Refuser</button></div>`;}else{html+=`<div class="action-text">Attends la décision de ${esc(targetPlayer.name)}.</div>`;}textEl.innerHTML=html;panel.appendChild(textEl);return;}if(game.auction && game.auction.status==='open'){const item=BOARD[game.auction.position];const min=game.auction.nextBid;const bidder=findPlayerById(game.auction.highestBidder);html=`<div class="action-title">Enchère active</div><div class="action-text">${item.name} est proposé à l'enchère. Mise actuelle ${game.auction.highestBid || 0} 💰 par ${esc(bidder?bidder.name:'aucun')}. Mise minimale ${min} 💰.</div><div class="action-buttons"><button class="btn btn-primary" onclick="openAuctionModal()">Faire une offre</button></div>`;textEl.innerHTML=html;panel.appendChild(textEl);return;}if(game.currentAction && game.currentAction.type==='buy' && game.currentAction.playerId===myPlayerId){const square=BOARD[game.currentAction.position];html=`<div class="action-title">Acheter une propriété</div><div class="action-text">Tu as atterri sur <strong>${square.name}</strong>. Prix ${square.price} 💰. Veux-tu l'acheter ou lancer une enchère ?</div><div class="action-buttons"><button class="btn btn-primary" onclick="buyProperty()">Acheter</button><button class="btn btn-secondary" onclick="startAuction()">Mettre aux enchères</button></div>`;textEl.innerHTML=html;panel.appendChild(textEl);return;}if(isMyTurn && currentPlayer && currentPlayer.inJail){const text=`<div class="action-title">En prison</div><div class="action-text">Tu es en prison (${currentPlayer.jailTurns||0} tour${(currentPlayer.jailTurns||0)>1?'s':''} restant${(currentPlayer.jailTurns||0)>1?'s':''}). Paye 120 💰 pour sortir immédiatement et jouer ce tour, ou passe ton tour.</div><div class="action-buttons"><button class="btn btn-primary" onclick="payBail()">Payer 120 💰</button><button class="btn btn-secondary" onclick="serveJailTurn()">Passer mon tour</button></div>`;textEl.innerHTML=text;panel.appendChild(textEl);return;}if(isMyTurn){html=`<div class="action-title">C'est ton tour</div><div class="action-text">Lance les dés pour te déplacer et prendre le contrôle du plateau.</div><div class="action-buttons"><button class="btn btn-primary" onclick="rollDice()">Lancer les dés</button><button class="btn btn-secondary" onclick="openTradeModal()">Proposer un échange</button></div>`;textEl.innerHTML=html;panel.appendChild(textEl);return;}html=`<div class="action-title">Tour de ${esc(currentPlayer?.name)}</div><div class="action-text">Ta partie est synchronisée. Attends que ${esc(currentPlayer?.name)} joue.</div>`;textEl.innerHTML=html;panel.appendChild(textEl);} 

function renderTimer(seconds){const timer=document.getElementById('turn-timer');if(countdownTimer) clearInterval(countdownTimer);function refresh(){const m=Math.floor(seconds/60).toString().padStart(2,'0');const s=(seconds%60).toString().padStart(2,'0');timer.textContent=`${m}:${s}`;if(seconds<=0){clearInterval(countdownTimer);timer.textContent='00:00';}seconds=Math.max(0,seconds-1);}refresh();countdownTimer=setInterval(()=>{refresh();},1000);} 

// Faces de dés dessinées (grille 3x3) : aucun emoji, et les valeurs viennent
// exclusivement de rollDice via animateDiceRoll — pas de second système de dés.
const DIE_PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};

function setDieValue(dieEl,value){
  if(!dieEl) return;
  const v=Number(value);
  const valid=Number.isFinite(v)&&v>=1&&v<=6;
  dieEl.dataset.value=valid?String(v):'';
  const face=dieEl.querySelector('.die-value');
  if(face){
    face.innerHTML=valid
      ? DIE_PIPS[v].map(pos=>`<span class="die-pip" style="grid-area:${Math.floor(pos/3)+1}/${(pos%3)+1}"></span>`).join('')
      : '<span class="die-idle">?</span>';
  }
  dieEl.setAttribute('aria-label',valid?`Dé : ${v}`:'Dé non lancé');
  updateDiceTotal();
}

function updateDiceTotal(){
  const out=document.getElementById('dice-total');
  if(!out) return;
  const d1=document.getElementById('die-1');
  const d2=document.getElementById('die-2');
  if(d1&&d1.classList.contains('rolling')){out.textContent='…';return;}
  const a=Number(d1&&d1.dataset.value), b=Number(d2&&d2.dataset.value);
  out.textContent=(a&&b)?`${a} + ${b} = ${a+b}`:'—';
}

function animateDiceRoll(die1Value,die2Value){const die1=document.getElementById('die-1');const die2=document.getElementById('die-2');if(!die1||!die2) return Promise.resolve();if(document.hidden){setDieValue(die1,die1Value);setDieValue(die2,die2Value);return Promise.resolve();}die1.classList.add('rolling');die2.classList.add('rolling');return new Promise(resolve=>{let step=0;const interval=setInterval(()=>{step+=1;setDieValue(die1,Math.ceil(Math.random()*6));setDieValue(die2,Math.ceil(Math.random()*6));if(step>=10){clearInterval(interval);die1.classList.remove('rolling');die2.classList.remove('rolling');setDieValue(die1,die1Value);setDieValue(die2,die2Value);resolve();}},70);});}

// Auparavant chaque client resolvait l'enchere : historique duplique et ecritures concurrentes.
function maybeResolveAuction(game){if(!isHost) return;if(!game.auction||game.auction.status!=='open') return;if(Date.now() <= game.auction.endAt) return;const auctionKey=`${game.auction.position}@${game.auction.endAt}`;if(resolvedAuctionKey===auctionKey) return;resolvedAuctionKey=auctionKey;const auction=game.auction;const winner=auction.highestBidder?findPlayerById(auction.highestBidder):null;const extra={'auction/status':'closed'};if(winner){const winnerIndex=game.players.findIndex(p=>p.id===winner.id);extra[`ownership/${auction.position}`]=winner.id;extra[`players/${winnerIndex}/cash`]=winner.cash-auction.highestBid;}update(getGameRef(game.code),nextTurnUpdates(game,extra));pushHistory(game.code,winner?`${winner.name} remporte ${BOARD[auction.position].name} pour ${auction.highestBid} 💰.`:`Aucune offre pour ${BOARD[auction.position].name}.`);}

function maybeResolveTradeTimeout(game){if(!isHost) return;if(!game.trade||game.trade.status!=='pending') return;if(Date.now() > game.trade.expiresAt){const tradeKey=`${game.trade.fromId}@${game.trade.createdAt}`;if(resolvedTradeKey===tradeKey) return;resolvedTradeKey=tradeKey;update(getGameRef(game.code),{'trade/status':'cancelled','trade/updatedAt':Date.now()});pushHistory(game.code,'La proposition d’échange a expiré.');}}

function nextTurnUpdates(game,extra={}){const nextIndex=(game.turnIndex+1)%game.players.length;const base={...extra,currentAction:null,turnIndex:nextIndex,turnDeadline:Date.now()+game.turnTimer*1000,updatedAt:Date.now()};if(nextIndex===0) base.round=(game.round||1)+1;return base;}

function pushHistory(code,text){push(ref(db,`banqueroll/${code}/history`),{text,ts:Date.now()});}
function pushChat(code,author,text){push(ref(db,`banqueroll/${code}/chat`),{author,text,ts:Date.now()});}

// Attend que l'etat Firebase reflète la nouvelle position avant de resoudre la case,
// sinon handleLanding travaillait sur un currentGame perime (ancien setTimeout de 300 ms).
function waitForPosition(playerId,position,timeout=4000){const deadline=Date.now()+timeout;return new Promise(resolve=>{(function check(){const p=currentGame&&currentGame.players&&currentGame.players.find(x=>x.id===playerId);if((p&&p.position===position)||Date.now()>deadline) resolve();else setTimeout(check,60);})();});}

async function rollDice(){
  if(rolling) return;
  if(!currentGame||currentGame.phase!=='playing') return;
  const player=currentGame.players[currentGame.turnIndex];
  if(!player||player.id!==myPlayerId) return;
  if(player.inJail){toast('Tu dois d’abord gérer ta situation en prison.');return;}
  rolling=true;
  try{
    const die1=Math.ceil(Math.random()*6);const die2=Math.ceil(Math.random()*6);const total=die1+die2;
    const nextPos=(player.position+total)%BOARD.length;
    // Le Depart est l'index 21, pas l'index 0 : l'ancien test donnait la prime au mauvais endroit.
    const passedStart=crossesStart(player.position,total);
    const result=document.getElementById('roll-result');result.textContent='Lancement des dés...';
    await animateDiceRoll(die1,die2);
    const updates={};
    updates[`players/${currentGame.turnIndex}/position`]=nextPos;
    if(passedStart) updates[`players/${currentGame.turnIndex}/cash`]=player.cash+START_BONUS;
    updates['turnDeadline']=Date.now()+currentGame.turnTimer*1000;
    updates['updatedAt']=Date.now();
    await update(getGameRef(currentGame.code),updates);
    pushHistory(currentGame.code,`${player.name} lance ${die1} + ${die2} et avance de ${total} cases vers ${BOARD[nextPos].name}.`);
    if(passedStart) pushHistory(currentGame.code,`${player.name} passe par la case Départ et encaisse ${START_BONUS} 💰.`);
    result.textContent=`${player.name} a lancé ${die1} et ${die2}.`;
    await waitForPosition(player.id,nextPos);
    await handleLanding(nextPos);
  } finally { rolling=false; }
}

async function handleLanding(position){const game=currentGame;const player=game.players[game.turnIndex];const square=BOARD[position];if(square.type==='start'){await update(getGameRef(game.code),nextTurnUpdates(game));pushHistory(game.code,`${player.name} a touché Départ.`);return;}if(square.type==='property'||square.type==='station'||square.type==='airport'){const owner=game.ownership?.[position]||null;if(!owner){await update(getGameRef(game.code),{currentAction:{type:'buy',position,playerId:player.id},turnDeadline:Date.now()+game.turnTimer*1000,updatedAt:Date.now()});return;}if(owner!==player.id){await payRent(position);return;}await update(getGameRef(game.code),nextTurnUpdates(game));return;}if(square.type==='tax'){await payAmount(player.id,square.amount||0,`${square.name}`);return;}if(square.type==='bank'){await handleBank(position);return;}if(square.type==='event'){await handleEvent(position);return;}if(square.type==='chance'){await handleChance(position);return;}if(square.type==='jail'){await update(getGameRef(game.code),nextTurnUpdates(game));pushHistory(game.code,`${player.name} se repose en prison.`);return;}if(square.type==='free'){await update(getGameRef(game.code),nextTurnUpdates(game));pushHistory(game.code,`${player.name} profite de la zone libre.`);return;}await update(getGameRef(game.code),nextTurnUpdates(game));}

async function payRent(position){const game=currentGame;const player=game.players[game.turnIndex];const ownerId=game.ownership[position];const owner=findPlayerById(ownerId);const amount=calculateRent(position,ownerId);if(player.cash < amount){await settleDebt(player.id,ownerId,amount);return;}const ownerIndex=game.players.findIndex(p=>p.id===ownerId);const updates=nextTurnUpdates(game,{[`players/${game.turnIndex}/cash`]:player.cash-amount,[`players/${ownerIndex}/cash`]:owner.cash+amount});await update(getGameRef(game.code),updates);pushHistory(game.code,`${player.name} paie ${amount} 💰 à ${owner.name} pour ${BOARD[position].name}.`);}

function calculateRent(position,ownerId){const square=BOARD[position];if(square.type==='property') return square.rent;const ownedCount=getOwnedCount(ownerId,square.type);if(square.type==='station') return 25 * Math.pow(2,Math.max(0,ownedCount-1));if(square.type==='airport') return 50 * ownedCount;return 0;}
function getOwnedCount(playerId,type){return Object.entries(currentGame.ownership||{}).filter(([pos,owner])=>owner===playerId && BOARD[pos].type===type).length;}

async function settleDebt(playerId,ownerId,amount){const game=currentGame;const playerIndex=game.players.findIndex(p=>p.id===playerId);const ownerIndex=game.players.findIndex(p=>p.id===ownerId);const player=game.players[playerIndex];const owner=game.players[ownerIndex];const updatedCash=Math.max(0,player.cash-amount);const updates=nextTurnUpdates(game,{[`players/${playerIndex}/cash`]:updatedCash,[`players/${ownerIndex}/cash`]:owner.cash+Math.max(0,player.cash)});await update(getGameRef(game.code),updates);pushHistory(game.code,`${player.name} n'a pas pu payer ${amount} 💰, il perd tout ce qu'il avait à ${owner.name}.`);} 

async function payAmount(playerId,amount,label){const game=currentGame;const playerIndex=game.players.findIndex(p=>p.id===playerId);const player=game.players[playerIndex];if(!player) return;const value=Number(amount)||0;const updatedCash=Math.max(0,player.cash-value);const updates=nextTurnUpdates(game,{[`players/${playerIndex}/cash`]:updatedCash});await update(getGameRef(game.code),updates);pushHistory(game.code,value>=0?`${player.name} paie ${value} 💰 pour ${label}.`:`${player.name} reçoit ${Math.abs(value)} 💰 (${label}).`);} 

async function handleBank(position){const game=currentGame;const player=game.players[game.turnIndex];const bonus = 140;const updates=nextTurnUpdates(game,{[`players/${game.turnIndex}/cash`]:player.cash+bonus});await update(getGameRef(game.code),updates);pushHistory(game.code,`${player.name} reçoit ${bonus} 💰 à ${BOARD[position].name}.`);} 

async function handleEvent(position){const game=currentGame;const player=game.players[game.turnIndex];const effects=[{text:'Vous recevez un dividende.',amount:120},{text:'Rénovation imprévue.',amount:-100},{text:'Commerce florissant.',amount:140},{text:'Amende municipale.',amount:-130},{text:'Loyer exceptionnel.',amount:160}];const pick=effects[Math.floor(Math.random()*effects.length)];await payAmount(player.id,-pick.amount,BOARD[position].name);pushHistory(game.code,`${player.name} ${pick.text}`);} 

async function handleChance(position){const game=currentGame;const actions=[{type:'bank',amount:100,text:'La banque te remercie, reçois 100 💰.'},{type:'jail',text:'Va en prison.','toJail':true},{type:'move',amount:3,text:'Avance de 3 cases.'},{type:'move',amount:-2,text:'Retourne de 2 cases.'},{type:'pay',amount:90,text:'Frais de service, paye 90 💰.'}];const pick=actions[Math.floor(Math.random()*actions.length)];const player=game.players[game.turnIndex];if(pick.type==='bank'){await payAmount(player.id,-pick.amount,BOARD[position].name);pushHistory(game.code,`${player.name} ${pick.text}`);}else if(pick.type==='jail'){await sendPlayerToJail(player.id);pushHistory(game.code,`${player.name} ${pick.text}`);}else if(pick.type==='move'){const next=(player.position+pick.amount+BOARD.length)%BOARD.length;await update(getGameRef(game.code),{[`players/${game.turnIndex}/position`]:next,turnDeadline:Date.now()+game.turnTimer*1000,updatedAt:Date.now()});pushHistory(game.code,`${player.name} ${pick.text}`);await waitForPosition(player.id,next);await handleLanding(next);}else if(pick.type==='pay'){await payAmount(player.id,pick.amount,BOARD[position].name);pushHistory(game.code,`${player.name} ${pick.text}`);} }

async function sendPlayerToJail(playerId){const game=currentGame;const playerIndex=game.players.findIndex(p=>p.id===playerId);const updates={[`players/${playerIndex}/position`]:7,[`players/${playerIndex}/inJail`]:true,[`players/${playerIndex}/jailTurns`]:2,currentAction:{type:'jail',playerId},turnDeadline:Date.now()+game.turnTimer*1000,updatedAt:Date.now()};await update(getGameRef(game.code),updates);} 

async function buyProperty(){const game=currentGame;if(!game.currentAction||game.currentAction.playerId!==myPlayerId) return;const square=BOARD[game.currentAction.position];const playerIndex=game.players.findIndex(p=>p.id===myPlayerId);const player=game.players[playerIndex];if(player.cash < square.price){toast('Pas assez d’argent.');return;}const updates=nextTurnUpdates(game,{[`ownership/${game.currentAction.position}`]:myPlayerId,[`players/${playerIndex}/cash`]:player.cash-square.price});await update(getGameRef(game.code),updates);pushHistory(game.code,`${player.name} achète ${square.name} pour ${square.price} 💰.`);}

async function startAuction(){const game=currentGame;if(!game.currentAction||game.currentAction.playerId!==myPlayerId) return;const square=BOARD[game.currentAction.position];const nextBid=Math.max(20,Math.ceil(square.price*0.3));const auction={status:'open',position:game.currentAction.position,nextBid,highestBid:0,highestBidder:null,endAt:Date.now()+AUCTION_DURATION*1000};await update(getGameRef(game.code),{auction,currentAction:null,updatedAt:Date.now()});pushHistory(game.code,`${(findPlayerById(myPlayerId)||{name:'?'}).name} lance l’enchère de ${square.name}.`);}

async function placeBid(){const bid=parseInt(document.getElementById('auction-bid').value,10);const game=currentGame;if(!game.auction||game.auction.status!=='open'){toast('Aucune enchère active.');return;}const player=findPlayerById(myPlayerId);if(!player) return;if(!Number.isFinite(bid)){toast('Montant invalide.');return;}if(player.cash < bid){toast('Pas assez de liquidités.');return;}if(bid < game.auction.nextBid){toast('Offre trop faible.');return;}const auction={...game.auction,highestBid:bid,highestBidder:myPlayerId,nextBid:bid+10};await update(getGameRef(game.code),{auction,updatedAt:Date.now()});pushHistory(game.code,`${player.name} enchérit ${bid} 💰.`);}

async function acceptTrade(){const game=currentGame;const trade=game.trade;if(!trade||trade.status!=='pending') return;const from=findPlayerById(trade.fromId);const to=findPlayerById(trade.toId);if(!from||!to){toast('Joueur introuvable.');return;}if(to.id!==myPlayerId){toast('Ce n’est pas à toi de répondre.');return;}const fromIndex=game.players.findIndex(p=>p.id===from.id);const toIndex=game.players.findIndex(p=>p.id===to.id);const updates={};updates[`players/${fromIndex}/cash`]=from.cash-trade.offerCash+trade.requestCash;updates[`players/${toIndex}/cash`]=to.cash-trade.requestCash+trade.offerCash;if(trade.offerProperty){updates[`ownership/${trade.offerProperty}`]=to.id;}if(trade.requestProperty){updates[`ownership/${trade.requestProperty}`]=from.id;}updates['trade/status']='accepted';updates['updatedAt']=Date.now();await update(getGameRef(game.code),updates);pushHistory(game.code,`${to.name} accepte l’échange proposé par ${from.name}.`);}

async function declineTrade(){const game=currentGame;if(!game.trade||game.trade.status!=='pending') return;await update(getGameRef(game.code),{'trade/status':'declined','trade/updatedAt':Date.now()});pushHistory(game.code,`${(findPlayerById(myPlayerId)||{name:'?'}).name} refuse l’échange.`);}

async function proposeTrade(){const game=currentGame;const recipient=document.getElementById('trade-recipient').value;const offerCash=parseInt(document.getElementById('trade-offer-cash').value,10)||0;const requestCash=parseInt(document.getElementById('trade-request-cash').value,10)||0;const offerProperty=document.getElementById('trade-offer-property').value||null;const requestProperty=document.getElementById('trade-request-property').value||null;const err=document.getElementById('trade-error');err.textContent='';if(!recipient){err.textContent='Choisis un destinataire.';return;}if(recipient===myPlayerId){err.textContent='Choisis un autre joueur.';return;}const player=findPlayerById(myPlayerId);if(offerCash>player.cash){err.textContent='Pas assez d’argent pour proposer cela.';return;}if(requestCash<0||offerCash<0){err.textContent='Montants invalides.';return;}const trade={fromId:myPlayerId,toId:recipient,offerCash,requestCash,offerProperty:offerProperty?Number(offerProperty):null,requestProperty:requestProperty?Number(requestProperty):null,status:'pending',expiresAt:Date.now()+TRADE_DURATION*1000,createdAt:Date.now()};await update(getGameRef(game.code),{trade,updatedAt:Date.now()});pushHistory(game.code,`${player.name} propose un échange à ${(findPlayerById(recipient)||{name:'?'}).name}.`);closeTradeModal();}

// La caution ne fait plus perdre le tour : le joueur sort et peut lancer les des,
// conformement au texte « sortir immediatement ».
async function payBail(){const game=currentGame;const playerIndex=game.players.findIndex(p=>p.id===myPlayerId);const player=game.players[playerIndex];if(!player) return;if(game.turnIndex!==playerIndex){toast('Ce n’est pas ton tour.');return;}if(player.cash < 120){toast('Pas assez pour payer la caution.');return;}const updates={[`players/${playerIndex}/cash`]:player.cash-120,[`players/${playerIndex}/inJail`]:false,[`players/${playerIndex}/jailTurns`]:0,currentAction:null,turnDeadline:Date.now()+game.turnTimer*1000,updatedAt:Date.now()};await update(getGameRef(game.code),updates);pushHistory(game.code,`${player.name} paie 120 💰 et sort de prison : le tour continue.`);} 

async function serveJailTurn(){const game=currentGame;const playerIndex=game.players.findIndex(p=>p.id===myPlayerId);const player=game.players[playerIndex];if(!player) return;if(game.turnIndex!==playerIndex) return;const remaining=Math.max(0,(player.jailTurns||0)-1);const extra={[`players/${playerIndex}/jailTurns`]:remaining};if(remaining===0) extra[`players/${playerIndex}/inJail`]=false;await update(getGameRef(game.code),nextTurnUpdates(game,extra));pushHistory(game.code,remaining===0?`${player.name} a purgé sa peine et sortira de prison à son prochain tour.`:`${player.name} reste en prison (${remaining} tour${remaining>1?'s':''} restant${remaining>1?'s':''}).`);} 

async function startGame(){if(!currentGame||!isHost) return;resetGuards();if(currentGame.players.length < 2){toast('Il faut au moins 2 joueurs pour démarrer.');return;}const players=currentGame.players.map(p=>({...p,position:START_INDEX,cash:START_CASH,jailTurns:0,inJail:false}));await update(getGameRef(currentGame.code),{players,phase:'playing',turnIndex:0,round:1,currentAction:null,ownership:null,auction:null,trade:null,winnerId:null,turnDeadline:Date.now()+currentGame.turnTimer*1000,updatedAt:Date.now()});pushHistory(currentGame.code,`La partie commence : ${WIN_NET_WORTH} 💰 de valeur nette ou ${MAX_ROUNDS} manches.`);}

// Relance une partie terminee en repartant du salon, sans perdre les joueurs.
async function restartGame(){if(!currentGame||!isHost) return;resetGuards();const players=currentGame.players.map(p=>({...p,position:START_INDEX,cash:START_CASH,jailTurns:0,inJail:false}));await update(getGameRef(currentGame.code),{players,phase:'lobby',turnIndex:0,round:1,currentAction:null,ownership:null,auction:null,trade:null,winnerId:null,history:null,turnDeadline:null,updatedAt:Date.now()});toast('Nouvelle partie prête.');}
async function deleteGame(){if(!currentGame){leaveGame();return;}if(!confirm('Supprimer la partie ?')) return;const code=currentGame.code;stopGameListener();currentGame=null;await remove(getGameRef(code));clearLocal();myCode=null;myPlayerId=null;isHost=false;show('s-home');}

// Condition de victoire : premier joueur a atteindre WIN_NET_WORTH, ou meilleure
// valeur nette apres MAX_ROUNDS manches. Seul l'hote ecrit le resultat.
function maybeFinishGame(game){
  if(!isHost||game.phase!=='playing') return;
  const best=bestPlayer(game);
  if(!best) return;
  const reachedTarget=netWorth(game,best)>=WIN_NET_WORTH;
  const outOfRounds=(game.round||1)>MAX_ROUNDS;
  if(!reachedTarget&&!outOfRounds) return;
  if(finishedKey===game.code) return;
  finishedKey=game.code;
  update(getGameRef(game.code),{phase:'finished',winnerId:best.id,currentAction:null,turnDeadline:null,updatedAt:Date.now()});
  pushHistory(game.code,reachedTarget
    ?`${best.name} atteint ${WIN_NET_WORTH} 💰 de valeur nette et remporte la partie.`
    :`Fin des ${MAX_ROUNDS} manches : ${best.name} gagne avec ${netWorth(game,best)} 💰 de valeur nette.`);
}

// Un joueur absent bloquait la partie indefiniment : l'hote passe les tours expires.
function startWatchdog(){if(watchdogTimer) return;watchdogTimer=setInterval(hostTick,2000);}

// Sans ce tick, une enchere ou un echange arrive a echeance restait ouvert
// tant qu'aucune autre ecriture Firebase ne declenchait renderState.
function hostTick(){
  const game=currentGame;
  if(!isHost||!game) return;
  maybeResolveAuction(game);
  maybeResolveTradeTimeout(game);
  enforceTurnDeadline();
}

function enforceTurnDeadline(){
  const game=currentGame;
  if(!isHost||!game||game.phase!=='playing') return;
  if(game.auction&&game.auction.status==='open') return;
  if(game.trade&&game.trade.status==='pending') return;
  if(!game.turnDeadline||Date.now()<=game.turnDeadline+TURN_GRACE_MS) return;
  if(enforcedDeadline===game.turnDeadline) return;
  enforcedDeadline=game.turnDeadline;
  const player=game.players[game.turnIndex];
  if(!player) return;
  const extra={};
  if(player.inJail){const remaining=Math.max(0,(player.jailTurns||0)-1);extra[`players/${game.turnIndex}/jailTurns`]=remaining;if(remaining===0) extra[`players/${game.turnIndex}/inJail`]=false;}
  update(getGameRef(game.code),nextTurnUpdates(game,extra));
  pushHistory(game.code,`${player.name} n’a pas joué à temps : son tour est passé.`);
}

function copyCode(){if(!myCode) return;navigator.clipboard.writeText(myCode).then(()=>toast('Code copié !'));}

function sendChat(){const input=document.getElementById('chat-input');const text=input.value.trim();if(!text||!currentGame) return;pushChat(currentGame.code,myName,text);input.value='';}

function autoReconnect(){parseStored();if(myCode && myPlayerId){get(getGameRef(myCode)).then(snap=>{if(!snap.exists()){clearLocal();return;}const game=snap.val();const existing=game.players.find(p=>p.id===myPlayerId);if(existing){myName=existing.name;myColor=existing.color;isHost=game.hostId===myPlayerId;saveLocal();attachPresence();startGameListener(myCode);if(game.phase==='lobby') show('s-lobby'); else show('s-game');} else {clearLocal();}});}}

Object.assign(window,{
  show,createGame,joinGame,copyCode,startGame,restartGame,deleteGame,leaveGame,sendChat,toggleDrawer,
  closeAuctionModal,openAuctionModal,placeBid,closeTradeModal,proposeTrade,acceptTrade,
  declineTrade,payBail,serveJailTurn,openTradeModal,rollDice,buyProperty,startAuction
});

function updateAuctionCountdown(auction){const countdown=document.getElementById('auction-countdown');const status=document.getElementById('auction-status');if(auctionTimer) clearInterval(auctionTimer);function tick(){const remaining=Math.max(0,Math.round((auction.endAt-Date.now())/1000));countdown.textContent=`${remaining}s`;status.textContent=remaining?`Temps restant`:'Calcul en cours...';if(remaining<=0){clearInterval(auctionTimer);}}tick();auctionTimer=setInterval(tick,1000);} 

document.addEventListener('DOMContentLoaded',()=>{initBoard();parseStored();if(myCode) autoReconnect();});
