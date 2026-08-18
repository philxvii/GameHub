
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, remove, push, increment, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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
const DEFAULT_TURN_TIME = 30;
const AUCTION_DURATION = 20;
const TRADE_DURATION = 30;
const BOARD = [
  {id:'start',name:'Départ',type:'start',label:'+200'},
  {id:'maple',name:'Rue Maple',type:'property',price:100,rent:10,group:'Sapin'},
  {id:'market',name:'Fête foraine',type:'event'},
  {id:'skyport',name:'Aéroport du Ciel',type:'airport',price:220,group:'Aéroports'},
  {id:'orchard',name:'Chemin de l’Oranger',type:'property',price:120,rent:12,group:'Verger'},
  {id:'tax1',name:'Impôt urbain',type:'tax',amount:140},
  {id:'harbor',name:'Station du Port',type:'station',price:150,group:'Gares'},
  {id:'amber',name:'Rue Ambre',type:'property',price:130,rent:13,group:'Ambre'},
  {id:'chance1',name:'Chance',type:'chance'},
  {id:'silver',name:'Croissant d’Argent',type:'property',price:160,rent:16,group:'Argent'},
  {id:'bankA',name:'Banque du Vallon',type:'bank'},
  {id:'east',name:'Gare de l’Est',type:'station',price:150,group:'Gares'},
  {id:'sunlit',name:'Allée Ensoleillée',type:'property',price:180,rent:18,group:'Soleil'},
  {id:'park',name:'Place du Parc',type:'property',price:180,rent:18,group:'Parc'},
  {id:'tax2',name:'Taxe de réseau',type:'tax',amount:180},
  {id:'cloud',name:'Aéroport du Nuage',type:'airport',price:240,group:'Aéroports'},
  {id:'pearl',name:'Avenue Perle',type:'property',price:200,rent:20,group:'Perle'},
  {id:'free',name:'Zone Libre',type:'free'},
  {id:'topaz',name:'Boulevard Topaze',type:'property',price:220,rent:22,group:'Topaze'},
  {id:'festival',name:'Carré des Fêtes',type:'event'},
  {id:'jail',name:'Prison',type:'jail'},
  {id:'olive',name:'Île d’Olive',type:'property',price:240,rent:24,group:'Olive'},
  {id:'north',name:'Station Nord',type:'station',price:160,group:'Gares'},
  {id:'saffron',name:'Route Safran',type:'property',price:260,rent:26,group:'Safran'},
  {id:'chance2',name:'Chance',type:'chance'},
  {id:'platinum',name:'Allée Platine',type:'property',price:280,rent:28,group:'Platine'},
  {id:'bridge',name:'Aéroport du Pont',type:'airport',price:260,group:'Aéroports'},
  {id:'moonlight',name:'Route Clair de Lune',type:'property',price:300,rent:30,group:'Lune'},
  {id:'tax3',name:'Taxe d’Étape',type:'tax',amount:200},
  {id:'ember',name:'Avenue Embrasée',type:'property',price:320,rent:32,group:'Embra'},
  {id:'bankB',name:'Banque du Phare',type:'bank'},
  {id:'cedar',name:'Rond-point Cèdre',type:'property',price:340,rent:34,group:'Cèdre'},
  {id:'south',name:'Station Sud',type:'station',price:170,group:'Gares'},
  {id:'harborview',name:'Vue du Port',type:'property',price:360,rent:36,group:'Port'},
  {id:'skyline',name:'Aéroport Horizon',type:'airport',price:280,group:'Aéroports'},
  {id:'ruby',name:'Allée Rubis',type:'property',price:360,rent:36,group:'Rubis'},
  {id:'event',name:'Événement',type:'event'},
  {id:'lumen',name:'Rue Lumen',type:'property',price:380,rent:38,group:'Lumen'},
  {id:'crystal',name:'Arcade Crystal',type:'property',price:400,rent:40,group:'Crystal'},
  {id:'chance3',name:'Chance',type:'chance'}
];

const GROUP_COLORS = {
  'Sapin':'#16a34a',
  'Verger':'#f97316',
  'Gares':'#6b7280',
  'Ambre':'#f59e0b',
  'Argent':'#60a5fa',
  'Aéroports':'#fb7185',
  'Soleil':'#fcd34d',
  'Perle':'#38bdf8',
  'Topaze':'#f97316',
  'Safran':'#f97316',
  'Platine':'#94a3b8',
  'Lune':'#818cf8',
  'Olive':'#34d399',
  'Embra':'#fb7185',
  'Cèdre':'#60a5fa',
  'Port':'#ef4444',
  'Rubis':'#ef4444',
  'Lumen':'#f59e0b',
  'Crystal':'#a78bfa'
};

  function hexToRgba(hex,alpha){const r=parseInt(hex.slice(1,3),16);const g=parseInt(hex.slice(3,5),16);const b=parseInt(hex.slice(5,7),16);return `rgba(${r},${g},${b},${alpha})`;}

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
let tradeTimer = null;

function show(id){document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));document.getElementById(id).classList.add('active');}
function toast(message){const toastEl=document.createElement('div');toastEl.textContent=message;toastEl.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(20,28,42,0.95);color:#f8d68d;padding:12px 18px;border-radius:999px;z-index:60;opacity:0;transition:opacity 0.18s';document.body.appendChild(toastEl);requestAnimationFrame(()=>toastEl.style.opacity='1');setTimeout(()=>{toastEl.style.opacity='0';setTimeout(()=>toastEl.remove(),250);},2400);}

function genCode(){const words=['ROLL','BANK','VALE','LIFT','NOVA','PLAZA','CASH','LOOP','ARCO','VALE'];return words[Math.floor(Math.random()*words.length)]+'-'+Math.floor(10+Math.random()*90);}
function clamp(num,min,max){return Math.min(Math.max(num,min),max);}
function makeId(){return Math.random().toString(36).slice(2,10);}
function parseStored(){myCode=localStorage.getItem('banqueroll-code');myPlayerId=localStorage.getItem('banqueroll-playerId');myName=localStorage.getItem('banqueroll-name');myColor=localStorage.getItem('banqueroll-color');}
function saveLocal(){localStorage.setItem('banqueroll-code',myCode);localStorage.setItem('banqueroll-playerId',myPlayerId);localStorage.setItem('banqueroll-name',myName);localStorage.setItem('banqueroll-color',myColor);}
function clearLocal(){localStorage.removeItem('banqueroll-code');localStorage.removeItem('banqueroll-playerId');localStorage.removeItem('banqueroll-name');localStorage.removeItem('banqueroll-color');}

function boardLayout(){const layout=[];for(let c=1;c<=11;c++)layout.push({r:11,c});for(let r=10;r>=2;r--)layout.push({r,c:11});for(let c=11;c>=1;c--)layout.push({r:1,c});for(let r=2;r<=10;r++)layout.push({r,c:1});return layout;}
const BOARD_LAYOUT = boardLayout();

function initBoard(){
  const grid=document.getElementById('board-grid');
  grid.innerHTML='';
  boardNodes=[];
  BOARD.forEach((square,index)=>{
    const coords=BOARD_LAYOUT[index]||{r:1,c:1};
    const node=document.createElement('div');
    const groupClass = square.group ? ' group-' + String(square.group).replace(/[^a-zA-Z0-9]/g,'-') : '';
    node.className = 'square ' + square.type + groupClass;
    node.dataset.index = index;
    node.style.gridRowStart = coords.r;
    node.style.gridColumnStart = coords.c;
    node.innerHTML = `<div class="square-top"><span class="square-name">${square.name}</span><span class="square-label">${square.type==='start'?'DÉPART':square.type==='jail'?'PRISON':square.type==='free'?'LIBRE':square.type.toUpperCase()}</span></div><div class="square-price">${square.type==='property'||square.type==='station'||square.type==='airport'?square.price+' 💰':square.type==='tax'?('-'+square.amount+' 💸'):''}</div><div class="square-band"></div><div class="pawn-container"></div>`;
    grid.appendChild(node);
    // apply group color to price pill when available (use fallback generator)
    const priceEl = node.querySelector('.square-price');
    if(priceEl && square.group){
      const gColor = getColorForGroup(square.group);
      if(gColor){
        priceEl.style.background = gColor;
        priceEl.style.color = '#ffffff';
        priceEl.style.display = 'inline-block';
        priceEl.style.padding = '6px 10px';
        priceEl.style.borderRadius = '8px';
        priceEl.style.fontWeight = '800';
      }
    }
    // tint the square background and color the band using group color
    const band = node.querySelector('.square-band');
    if(square.group){
      const gColor = getColorForGroup(square.group);
      if(band) band.style.background = gColor;
      try{ if(gColor && gColor.startsWith('#')) node.style.background = hexToRgba(gColor,0.06); else if(gColor) node.style.background = gColor.replace('hsl','hsla').replace(')',',0.06)'); }catch(e){}
    }
    boardNodes.push(node);
  });
  const center=document.createElement('div');
  center.className='board-center';
  center.innerHTML=`<div class="trade-reference"><strong>$10<br><small>RIO</small></strong><div>Choose your property to trade</div><div class="trade-slots"><div class="trade-slot"></div><div class="trade-pass">×<small>PASS</small></div><div class="trade-slot blue"></div></div><div class="auction-copy">Auction closing in <b>49 sec</b></div></div>`;
  grid.appendChild(center);
}



function getGameRef(code){return ref(db,`banqueroll/${code}`);} 
function getPresenceRef(code,playerId){return ref(db,`banqueroll/${code}/presence/${playerId}`);} 

async function createGame(){const name=document.getElementById('create-name').value.trim();const players=parseInt(document.getElementById('create-players').value,10);const timer=parseInt(document.getElementById('create-timer').value,10);const err=document.getElementById('create-error');err.textContent='';if(!name){err.textContent='Entre ton prénom.';return;}if(players<2||players>8){err.textContent='Choisis entre 2 et 8 joueurs.';return;}myCode=genCode();myPlayerId=makeId();myName=name;myColor=PLAYER_COLORS[0];isHost=true;saveLocal();const player={id:myPlayerId,name,position:0,cash:START_CASH,jailTurns:0,inJail:false,color:myColor,ready:true};const game={code:myCode,hostId:myPlayerId,maxPlayers:players,turnTimer:timer,players:[player],phase:'lobby',turnIndex:0,currentAction:null,ownership:{},auction:null,trade:null,turnDeadline:null,createdAt:Date.now(),updatedAt:Date.now()};await set(getGameRef(myCode),game);attachPresence();startGameListener(myCode);renderLobby(game);show('s-lobby');}

async function joinGame(){const code=document.getElementById('join-code').value.trim().toUpperCase();const name=document.getElementById('join-name').value.trim();const err=document.getElementById('join-error');err.textContent='';if(!code){err.textContent='Entre le code de la partie.';return;}if(!name){err.textContent='Entre ton prénom.';return;}show('s-joining');const snap=await get(getGameRef(code));if(!snap.exists()){err.textContent='Code introuvable.';show('s-join');return;}const game=snap.val();if(game.phase!=='lobby'){err.textContent='La partie est déjà lancée.';show('s-join');return;}const existing=game.players.find(p=>p.name.toLowerCase()===name.toLowerCase());if(existing){myCode=code;myPlayerId=existing.id;myName=existing.name;myColor=existing.color;saveLocal();isHost=game.hostId===myPlayerId;attachPresence();startGameListener(code);return;}if(game.players.length>=game.maxPlayers){err.textContent='La partie est complète.';show('s-join');return;}myPlayerId=makeId();myName=name;myColor=PLAYER_COLORS[game.players.length % PLAYER_COLORS.length];isHost=false;const player={id:myPlayerId,name,position:0,cash:START_CASH,jailTurns:0,inJail:false,color:myColor,ready:true};const updatedPlayers=[...game.players,player];await update(getGameRef(code),{players:updatedPlayers,updatedAt:Date.now()});saveLocal();attachPresence();startGameListener(code);} 

function attachPresence(){if(!myCode||!myPlayerId) return;const presRef=getPresenceRef(myCode,myPlayerId);set(presRef,{name:myName,ts:Date.now()});onDisconnect(presRef).remove();}

function startGameListener(code){if(gameListener) gameListener();gameListener = onValue(getGameRef(code), snap => {if(!snap.exists()){toast('La partie a été supprimée.');clearLocal();show('s-home');return;}const game=snap.val();currentGame=game;renderState(game);});}

function renderState(game){document.getElementById('stat-players').textContent=`${game.players.length} / ${game.maxPlayers}`;document.getElementById('stat-pot').textContent=`${Object.values(game.ownership||{}).length} actifs`;renderChat(game);renderHistory(game);renderPlayers(game);renderBoard(game);if(game.phase==='lobby'){renderLobby(game);renderAction(game);if(!document.getElementById('s-lobby').classList.contains('active')) show('s-lobby');}else{renderAction(game);show('s-game');}if(game.auction && game.auction.status==='open'){openAuctionModal(game.auction);}else{closeAuctionModal();}if(game.trade && game.trade.status==='pending'){renderTradePrompt(game.trade);}else{closeTradePrompt();}maybeResolveAuction(game);maybeResolveTradeTimeout(game);}

function renderLobby(game){document.getElementById('lobby-code').textContent=game.code;const container=document.getElementById('lobby-players');container.innerHTML='';game.players.forEach((player,index)=>{const card=document.createElement('div');card.className='player-card'+(player.id===myPlayerId?' current':'');card.innerHTML=`<div class="player-meta"><span class="player-name">${player.name}</span><span class="player-sub">${player.id===game.hostId?'Hôte':''}</span></div><div class="player-chip" style="background:${player.color};">${player.name[0].toUpperCase()}</div>`;container.appendChild(card);});const canStart = isHost && game.players.length >= 2;document.getElementById('start-game-btn').disabled = !canStart;}

function openAuctionModal(auction){const modal=document.getElementById('modal-auction');modal.classList.add('active');const details=document.getElementById('auction-details');const item=BOARD[auction.position];const owner=auction.highestBidder?findPlayerById(auction.highestBidder).name:'aucun';details.textContent=`${item.name} est en vente. Mise minimale : ${auction.nextBid} 💰. Meilleure offre actuelle : ${auction.highestBid || 0} par ${owner}.`;document.getElementById('auction-bid').value=auction.nextBid;updateAuctionCountdown(auction);} 
function closeAuctionModal(){document.getElementById('modal-auction').classList.remove('active');}

function openTradeModal(){populateTradeOptions();document.getElementById('trade-error').textContent='';document.getElementById('modal-trade').classList.add('active');}
function closeTradeModal(){document.getElementById('modal-trade').classList.remove('active');}
function closeTradePrompt(){const panel=document.getElementById('trade-action-box');if(panel) panel.remove();}

function populateTradeOptions(){const recipient=document.getElementById('trade-recipient');const offerProp=document.getElementById('trade-offer-property');const requestProp=document.getElementById('trade-request-property');recipient.innerHTML='';offerProp.innerHTML='<option value="">Aucune</option>';requestProp.innerHTML='<option value="">Aucune</option>';const others=currentGame.players.filter(p=>p.id!==myPlayerId);others.forEach(player=>recipient.insertAdjacentHTML('beforeend',`<option value="${player.id}">${player.name}</option>`));const myProps=getOwnedProperties(myPlayerId);myProps.forEach(pos=>offerProp.insertAdjacentHTML('beforeend',`<option value="${pos}">${BOARD[pos].name}</option>`));const allProps=currentGame.players.filter(p=>p.id!==myPlayerId).flatMap(p=>getOwnedProperties(p.id).map(pos=>({pos,player:p})));allProps.forEach(item=>requestProp.insertAdjacentHTML('beforeend',`<option value="${item.pos}">${item.player.name} • ${BOARD[item.pos].name}</option>`));}

function findPlayerById(id){return currentGame.players.find(p=>p.id===id);} 
function getOwnedProperties(playerId){return Object.entries(currentGame.ownership||{}).filter(([,owner])=>owner===playerId).map(([pos])=>Number(pos));}

function renderPlayers(game){const panel=document.getElementById('players-panel');if(!panel) return;panel.innerHTML='';const playersList=document.createElement('div');playersList.className='player-list';game.players.forEach((player,index)=>{const card=document.createElement('div');card.className='player-card'+(game.turnIndex===index?' current':'');card.innerHTML=`<div class="player-meta"><span class="player-name">${player.name}${player.id===game.hostId?' • Hôte':''}</span><span class="player-sub">${player.cash} 💰${player.inJail?' • En prison':''}${player.jailTurns?' • '+player.jailTurns+' tours':''}</span></div><div class="player-chip" style="background:${player.color};">${player.name[0].toUpperCase()}</div>`;playersList.appendChild(card);});panel.innerHTML='<h3>Tableau des joueurs</h3>';panel.appendChild(playersList);}

function renderChat(game){const chatList=document.getElementById('chat-list');if(!chatList) return;chatList.innerHTML='';const messages=game.chat?Object.values(game.chat).sort((a,b)=>a.ts-b.ts):[];messages.slice(-20).forEach(msg=>{const line=document.createElement('div');line.className='chat-item';line.innerHTML=`<strong>${msg.author}</strong><span>${msg.text}</span>`;chatList.appendChild(line);});chatList.scrollTop=chatList.scrollHeight;}

function renderHistory(game){const historyList=document.getElementById('history-list');if(!historyList) return;historyList.innerHTML='';const events=game.history?Object.values(game.history).sort((a,b)=>a.ts-b.ts):[];events.slice(-18).reverse().forEach(item=>{const el=document.createElement('div');el.className='history-item';el.textContent=item.text;historyList.appendChild(el);});}

function renderBoard(game){if(!boardNodes.length) initBoard();boardNodes.forEach((node,index)=>{const square=BOARD[index];node.className='square '+square.type;const ownerId=game.ownership?.[index]||null;const owner=findPlayerById(ownerId);const title=node.querySelector('.square-name');const label=node.querySelector('.square-label');const price=node.querySelector('.square-price');const pawnContainer=node.querySelector('.pawn-container');title.textContent=square.name;label.textContent=square.type==='start'?'DÉPART':square.type==='free'?'LIBRE':square.type==='jail'?'PRISON':square.type==='tax'?'IMPÔT':square.type==='event'?'ÉVÈNEMENT':square.type==='chance'?'CHANCE':square.type.toUpperCase();price.textContent=square.type==='property'||square.type==='station'||square.type==='airport'?square.price+' 💰':square.type==='tax'?-square.amount+' 💸':'';pawnContainer.innerHTML='';const occupants=game.players.filter(p=>p.position===index);occupants.forEach(p=>{const pawn=document.createElement('div');pawn.className='pawn';pawn.style.background=p.color;pawn.textContent=p.name[0].toUpperCase();pawnContainer.appendChild(pawn);});const ownerPill=node.querySelector('.owner-pill');if(ownerId){if(ownerPill){ownerPill.textContent=`${owner.name}`;} else {const pill=document.createElement('div');pill.className='owner-pill';pill.textContent=owner.name;node.appendChild(pill);} } else if(ownerPill){ownerPill.remove();}if(game.turnIndex!==undefined && game.players[game.turnIndex]?.position===index){node.classList.add('current');} else node.classList.remove('current');});}

function renderAction(game){clearInterval(countdownTimer);const actionText=document.getElementById('action-text');const turnName=document.getElementById('turn-player');const turnStatus=document.getElementById('turn-status');const result=document.getElementById('roll-result');const deadline=game.turnDeadline?Math.max(0,Math.round((game.turnDeadline-Date.now())/1000)):0;turnName.textContent=`${game.players[game.turnIndex]?.name || '...'} (${game.players.length} joueurs)`;turnStatus.textContent=game.phase==='playing'?'En cours':'Salon';result.textContent=game.currentAction?`Action en attente: ${game.currentAction.type}`:'Prêt à jouer';renderTimer(deadline);const panel=document.getElementById('action-panel');panel.innerHTML='';if(game.phase==='lobby'){const box=document.createElement('div');box.className='action-box';box.innerHTML=`<div class="action-title">Salon</div><div class="action-text">Attends que l'hôte démarre la partie. Le code de la partie est <strong>${game.code}</strong>.</div>`;panel.appendChild(box);return;}const currentPlayer=game.players[game.turnIndex];const isMyTurn=currentPlayer?.id===myPlayerId;const title=game.currentAction?`Action requise`:'À ton tour';const textEl=document.createElement('div');textEl.className='action-box';let html='';if(game.trade && game.trade.status==='pending' && [game.trade.fromId,game.trade.toId].includes(myPlayerId)){const offerPlayer=findPlayerById(game.trade.fromId);const targetPlayer=findPlayerById(game.trade.toId);const offerItem=game.trade.offerProperty?BOARD[game.trade.offerProperty].name:'Aucun';const requestItem=game.trade.requestProperty?BOARD[game.trade.requestProperty].name:'Aucun';html=`<div class="action-title">Échange proposé</div><div class="action-text"><strong>${offerPlayer.name}</strong> propose ${game.trade.offerCash} 💰 et ${offerItem} contre ${game.trade.requestCash} 💰 et ${requestItem} de <strong>${targetPlayer.name}</strong>.</div>`;if(isMyTurn){html+=`<div class="action-buttons"><button class="btn btn-primary" onclick="acceptTrade()">Accepter</button><button class="btn btn-secondary" onclick="declineTrade()">Refuser</button></div>`;}else{html+=`<div class="action-text">Attends la décision de ${targetPlayer.name}.</div>`;}textEl.innerHTML=html;panel.appendChild(textEl);return;}if(game.auction && game.auction.status==='open'){const item=BOARD[game.auction.position];const min=game.auction.nextBid;const leader=game.auction.highestBidder?findPlayerById(game.auction.highestBidder).name:'aucun';html=`<div class="action-title">Enchère active</div><div class="action-text">${item.name} est proposé à l'enchère. Mise actuelle ${game.auction.highestBid || 0} 💰 par ${leader}. Mise minimale ${min} 💰.</div>`;if(isMyTurn){html+=`<div class="action-buttons"><button class="btn btn-primary" onclick="openAuctionModal(currentGame.auction)">Faire une offre</button></div>`;}textEl.innerHTML=html;panel.appendChild(textEl);return;}if(game.currentAction && game.currentAction.type==='buy' && game.currentAction.playerId===myPlayerId){const square=BOARD[game.currentAction.position];html=`<div class="action-title">Acheter une propriété</div><div class="action-text">Tu as atterri sur <strong>${square.name}</strong>. Prix ${square.price} 💰. Veux-tu l'acheter ou lancer une enchère ?</div><div class="action-buttons"><button class="btn btn-primary" onclick="buyProperty()">Acheter</button><button class="btn btn-secondary" onclick="startAuction()">Mettre aux enchères</button></div>`;textEl.innerHTML=html;panel.appendChild(textEl);return;}if(game.currentAction && game.currentAction.type==='jail' && game.currentAction.playerId===myPlayerId){const text=`<div class="action-title">En prison</div><div class="action-text">Tu es en prison. Paye 120 💰 pour sortir immédiatement ou reste un tour de plus.</div><div class="action-buttons"><button class="btn btn-primary" onclick="payBail()">Payer 120 💰</button><button class="btn btn-secondary" onclick="serveJailTurn()">Rester</button></div>`;textEl.innerHTML=text;panel.appendChild(textEl);return;}if(isMyTurn){html=`<div class="action-title">C'est ton tour</div><div class="action-text">Lance les dés pour te déplacer et prendre le contrôle du plateau.</div><div class="action-buttons"><button class="btn btn-primary" onclick="rollDice()">Lancer les dés</button><button class="btn btn-secondary" onclick="openTradeModal()">Proposer un échange</button></div>`;textEl.innerHTML=html;panel.appendChild(textEl);return;}html=`<div class="action-title">Tour de ${currentPlayer?.name}</div><div class="action-text">Ta partie est synchronisée. Attends que ${currentPlayer?.name} joue.</div>`;textEl.innerHTML=html;panel.appendChild(textEl);} 

function renderTimer(seconds){const timer=document.getElementById('turn-timer');if(countdownTimer) clearInterval(countdownTimer);function refresh(){const m=Math.floor(seconds/60).toString().padStart(2,'0');const s=(seconds%60).toString().padStart(2,'0');timer.textContent=`${m}:${s}`;if(seconds<=0){clearInterval(countdownTimer);timer.textContent='00:00';}seconds=Math.max(0,seconds-1);}refresh();countdownTimer=setInterval(()=>{refresh();},1000);} 

function setDieValue(dieEl,value){if(!dieEl) return;dieEl.dataset.value=value;const label=dieEl.querySelector('.die-value');if(label){label.textContent=['⚀','⚁','⚂','⚃','⚄','⚅'][value-1];}}

function animateDiceRoll(die1Value,die2Value){const die1=document.getElementById('die-1');const die2=document.getElementById('die-2');if(!die1||!die2) return Promise.resolve();die1.classList.add('rolling');die2.classList.add('rolling');return new Promise(resolve=>{let step=0;const interval=setInterval(()=>{step+=1;setDieValue(die1,Math.ceil(Math.random()*6));setDieValue(die2,Math.ceil(Math.random()*6));if(step>=10){clearInterval(interval);die1.classList.remove('rolling');die2.classList.remove('rolling');setDieValue(die1,die1Value);setDieValue(die2,die2Value);resolve();}},70);});}

function maybeResolveAuction(game){if(!game.auction||game.auction.status!=='open') return;if(Date.now() > game.auction.endAt){const nextIndex=(game.turnIndex+1)%game.players.length;const updates={};const auction=game.auction;const winner=findPlayerById(auction.highestBidder);if(winner){updates[`ownership/${auction.position}`]=winner.id;updates[`players/${game.players.findIndex(p=>p.id===winner.id)}/cash`]=winner.cash-auction.highestBid;const note=`${winner.name} remporte ${BOARD[auction.position].name} pour ${auction.highestBid} 💰.`;pushHistory(game.code,note);} else {pushHistory(game.code,`Aucune offre pour ${BOARD[auction.position].name}.`);}updates['auction/status']='closed';updates['turnIndex']=nextIndex;updates['turnDeadline']=Date.now()+currentGame.turnTimer*1000;updates['updatedAt']=Date.now();update(getGameRef(game.code),updates);}}

function maybeResolveTradeTimeout(game){if(!game.trade||game.trade.status!=='pending') return;if(Date.now() > game.trade.expiresAt){update(getGameRef(game.code),{'trade/status':'cancelled','trade/updatedAt':Date.now()});pushHistory(game.code,'La proposition d’échange a expiré.');}}

function nextTurnUpdates(game,extra={}){return {...extra,currentAction:null,turnIndex:(game.turnIndex+1)%game.players.length,turnDeadline:Date.now()+game.turnTimer*1000,updatedAt:Date.now()};}

function pushHistory(code,text){push(ref(db,`banqueroll/${code}/history`),{text,ts:Date.now()});}
function pushChat(code,author,text){push(ref(db,`banqueroll/${code}/chat`),{author,text,ts:Date.now()});}

async function rollDice(){if(!currentGame||currentGame.phase!=='playing') return;const player=currentGame.players[currentGame.turnIndex];if(player.id!==myPlayerId) return; if(player.inJail){toast('Tu dois d’abord gérer ta situation en prison.');return;}const die1=Math.ceil(Math.random()*6);const die2=Math.ceil(Math.random()*6);const total=die1+die2;const nextPos=(player.position+total)%BOARD.length;const passedStart=(player.position+total)>=BOARD.length;const result=document.getElementById('roll-result');result.textContent='Lancement des dés...';await animateDiceRoll(die1,die2);const updates={};updates[`players/${currentGame.turnIndex}/position`]=nextPos; if(passedStart){updates[`players/${currentGame.turnIndex}/cash`]=player.cash+200;pushHistory(currentGame.code,`${player.name} passe par la case Départ et encaisse 200 💰.`);}updates['updatedAt']=Date.now();await update(getGameRef(currentGame.code),updates);pushHistory(currentGame.code,`${player.name} lance ${die1} + ${die2} et avance de ${total} cases vers ${BOARD[nextPos].name}.`);result.textContent=`${player.name} a lancé ${die1} et ${die2}.`;setTimeout(()=>handleLanding(nextPos),300);}

async function handleLanding(position){const game=currentGame;const player=game.players[game.turnIndex];const square=BOARD[position];if(square.type==='start'){await update(getGameRef(game.code),nextTurnUpdates(game));pushHistory(game.code,`${player.name} a touché Départ.`);return;}if(square.type==='property'||square.type==='station'||square.type==='airport'){const owner=game.ownership?.[position]||null;if(!owner){await update(getGameRef(game.code),{currentAction:{type:'buy',position,playerId:player.id},turnDeadline:Date.now()+game.turnTimer*1000,updatedAt:Date.now()});return;}if(owner!==player.id){await payRent(position);return;}await update(getGameRef(game.code),nextTurnUpdates(game));return;}if(square.type==='tax'){await payAmount(player.id,square.amount,`${square.name}`);return;}if(square.type==='bank'){await handleBank(position);return;}if(square.type==='event'){await handleEvent(position);return;}if(square.type==='chance'){await handleChance(position);return;}if(square.type==='jail'){await update(getGameRef(game.code),nextTurnUpdates(game));pushHistory(game.code,`${player.name} se repose en prison.`);return;}if(square.type==='free'){await update(getGameRef(game.code),nextTurnUpdates(game));pushHistory(game.code,`${player.name} profite de la zone libre.`);return;}await update(getGameRef(game.code),nextTurnUpdates(game));}

async function payRent(position){const game=currentGame;const player=game.players[game.turnIndex];const ownerId=game.ownership[position];const owner=findPlayerById(ownerId);const amount=calculateRent(position,ownerId);if(player.cash < amount){await settleDebt(player.id,ownerId,amount);return;}const ownerIndex=game.players.findIndex(p=>p.id===ownerId);const updates=nextTurnUpdates(game,{[`players/${game.turnIndex}/cash`]:player.cash-amount,[`players/${ownerIndex}/cash`]:owner.cash+amount});await update(getGameRef(game.code),updates);pushHistory(game.code,`${player.name} paie ${amount} 💰 à ${owner.name} pour ${BOARD[position].name}.`);}

function calculateRent(position,ownerId){const square=BOARD[position];if(square.type==='property') return square.rent;const ownedCount=getOwnedCount(ownerId,square.type);if(square.type==='station') return 25 * Math.pow(2,Math.max(0,ownedCount-1));if(square.type==='airport') return 50 * ownedCount;return 0;}
function getOwnedCount(playerId,type){return Object.entries(currentGame.ownership||{}).filter(([pos,owner])=>owner===playerId && BOARD[pos].type===type).length;}

async function settleDebt(playerId,ownerId,amount){const game=currentGame;const playerIndex=game.players.findIndex(p=>p.id===playerId);const ownerIndex=game.players.findIndex(p=>p.id===ownerId);const player=game.players[playerIndex];const owner=game.players[ownerIndex];const updatedCash=Math.max(0,player.cash-amount);const updates=nextTurnUpdates(game,{[`players/${playerIndex}/cash`]:updatedCash,[`players/${ownerIndex}/cash`]:owner.cash+Math.max(0,player.cash)});await update(getGameRef(game.code),updates);pushHistory(game.code,`${player.name} n'a pas pu payer ${amount} 💰, il perd tout ce qu'il avait à ${owner.name}.`);} 

async function payAmount(playerId,amount,label){const game=currentGame;const playerIndex=game.players.findIndex(p=>p.id===playerId);const player=game.players[playerIndex];const updatedCash=Math.max(0,player.cash-amount);const updates=nextTurnUpdates(game,{[`players/${playerIndex}/cash`]:updatedCash});await update(getGameRef(game.code),updates);pushHistory(game.code,`${player.name} paie ${amount} 💰 pour ${label}.`);} 

async function handleBank(position){const game=currentGame;const player=game.players[game.turnIndex];const bonus = (position===10?120:140);const updates=nextTurnUpdates(game,{[`players/${game.turnIndex}/cash`]:player.cash+bonus});await update(getGameRef(game.code),updates);pushHistory(game.code,`${player.name} reçoit ${bonus} 💰 à ${BOARD[position].name}.`);} 

async function handleEvent(position){const game=currentGame;const player=game.players[game.turnIndex];const effects=[{text:'Vous recevez un dividende.',amount:120},{text:'Rénovation imprévue.',amount:-100},{text:'Commerce florissant.',amount:140},{text:'Amende municipale.',amount:-130},{text:'Loyer exceptionnel.',amount:160}];const pick=effects[Math.floor(Math.random()*effects.length)];await payAmount(player.id,-pick.amount,BOARD[position].name);pushHistory(game.code,`${player.name} ${pick.text}`);} 

async function handleChance(position){const game=currentGame;const actions=[{type:'bank',amount:100,text:'La banque te remercie, reçois 100 💰.'},{type:'jail',text:'Va en prison.','toJail':true},{type:'move',amount:3,text:'Avance de 3 cases.'},{type:'move',amount:-2,text:'Retourne de 2 cases.'},{type:'pay',amount:90,text:'Frais de service, paye 90 💰.'}];const pick=actions[Math.floor(Math.random()*actions.length)];const player=game.players[game.turnIndex];if(pick.type==='bank'){await payAmount(player.id,-pick.amount,BOARD[position].name);pushHistory(game.code,`${player.name} ${pick.text}`);}else if(pick.type==='jail'){await sendPlayerToJail(player.id);pushHistory(game.code,`${player.name} ${pick.text}`);}else if(pick.type==='move'){const next=(player.position+pick.amount+BOARD.length)%BOARD.length;await update(getGameRef(game.code),{[`players/${game.turnIndex}/position`]:next,turnDeadline:Date.now()+game.turnTimer*1000,updatedAt:Date.now()});pushHistory(game.code,`${player.name} ${pick.text}`);setTimeout(()=>handleLanding(next),300);}else if(pick.type==='pay'){await payAmount(player.id,pick.amount,BOARD[position].name);pushHistory(game.code,`${player.name} ${pick.text}`);} }

async function sendPlayerToJail(playerId){const game=currentGame;const playerIndex=game.players.findIndex(p=>p.id===playerId);const updates={[`players/${playerIndex}/position`]:20,[`players/${playerIndex}/inJail`]:true,[`players/${playerIndex}/jailTurns`]:2,currentAction:{type:'jail',playerId},turnDeadline:Date.now()+game.turnTimer*1000,updatedAt:Date.now()};await update(getGameRef(game.code),updates);} 

async function buyProperty(){const game=currentGame;if(!game.currentAction||game.currentAction.playerId!==myPlayerId) return;const square=BOARD[game.currentAction.position];const playerIndex=game.players.findIndex(p=>p.id===myPlayerId);const player=game.players[playerIndex];if(player.cash < square.price){toast('Pas assez d’argent.');return;}const updates=nextTurnUpdates(game,{[`ownership/${game.currentAction.position}`]:myPlayerId,[`players/${playerIndex}/cash`]:player.cash-square.price});await update(getGameRef(game.code),updates);pushHistory(game.code,`${player.name} achète ${square.name} pour ${square.price} 💰.`);}

async function startAuction(){const game=currentGame;if(!game.currentAction||game.currentAction.playerId!==myPlayerId) return;const square=BOARD[game.currentAction.position];const nextBid=Math.max(20,Math.ceil(square.price*0.3));const auction={status:'open',position:game.currentAction.position,nextBid,highestBid:0,highestBidder:null,endAt:Date.now()+AUCTION_DURATION*1000};await update(getGameRef(game.code),{auction,currentAction:null,updatedAt:Date.now()});pushHistory(game.code,`${findPlayerById(myPlayerId).name} lance l’enchère de ${square.name}.`);}

async function placeBid(){const bid=parseInt(document.getElementById('auction-bid').value,10);const game=currentGame;if(!game.auction||game.auction.status!=='open'){toast('Aucune enchère active.');return;}const player=findPlayerById(myPlayerId);if(player.cash < bid){toast('Pas assez de liquidités.');return;}if(bid < game.auction.nextBid){toast('Offre trop faible.');return;}const auction={...game.auction,highestBid:bid,highestBidder:myPlayerId,nextBid:bid+10};await update(getGameRef(game.code),{auction,updatedAt:Date.now()});pushHistory(game.code,`${player.name} enchérit ${bid} 💰.`);}

async function acceptTrade(){const game=currentGame;const trade=game.trade;if(!trade||trade.status!=='pending') return;const me=findPlayerById(myPlayerId);const from=findPlayerById(trade.fromId);const to=findPlayerById(trade.toId);if(to.id!==myPlayerId){toast('Ce n’est pas à toi de répondre.');return;}const fromIndex=game.players.findIndex(p=>p.id===from.id);const toIndex=game.players.findIndex(p=>p.id===to.id);const updates={};updates[`players/${fromIndex}/cash`]=from.cash-trade.offerCash+trade.requestCash;updates[`players/${toIndex}/cash`]=to.cash-trade.requestCash+trade.offerCash;if(trade.offerProperty){updates[`ownership/${trade.offerProperty}`]=to.id;}if(trade.requestProperty){updates[`ownership/${trade.requestProperty}`]=from.id;}updates['trade/status']='accepted';updates['updatedAt']=Date.now();await update(getGameRef(game.code),updates);pushHistory(game.code,`${to.name} accepte l’échange proposé par ${from.name}.`);}

async function declineTrade(){const game=currentGame;if(!game.trade||game.trade.status!=='pending') return;await update(getGameRef(game.code),{'trade/status':'declined','trade/updatedAt':Date.now()});pushHistory(game.code,`${findPlayerById(myPlayerId).name} refuse l’échange.`);}

async function proposeTrade(){const game=currentGame;const recipient=document.getElementById('trade-recipient').value;const offerCash=parseInt(document.getElementById('trade-offer-cash').value,10)||0;const requestCash=parseInt(document.getElementById('trade-request-cash').value,10)||0;const offerProperty=document.getElementById('trade-offer-property').value||null;const requestProperty=document.getElementById('trade-request-property').value||null;const err=document.getElementById('trade-error');err.textContent='';if(!recipient){err.textContent='Choisis un destinataire.';return;}if(recipient===myPlayerId){err.textContent='Choisis un autre joueur.';return;}const player=findPlayerById(myPlayerId);if(offerCash>player.cash){err.textContent='Pas assez d’argent pour proposer cela.';return;}if(requestCash<0||offerCash<0){err.textContent='Montants invalides.';return;}const trade={fromId:myPlayerId,toId:recipient,offerCash,requestCash,offerProperty:offerProperty?Number(offerProperty):null,requestProperty:requestProperty?Number(requestProperty):null,status:'pending',expiresAt:Date.now()+TRADE_DURATION*1000,createdAt:Date.now()};await update(getGameRef(game.code),{trade,updatedAt:Date.now()});pushHistory(game.code,`${player.name} propose un échange à ${findPlayerById(recipient).name}.`);closeTradeModal();}

function renderTradePrompt(trade){const panel=document.getElementById('action-panel');panel.innerHTML='';const box=document.createElement('div');box.className='action-box';const from=findPlayerById(trade.fromId);const to=findPlayerById(trade.toId);const offerItem=trade.offerProperty?BOARD[trade.offerProperty].name:'Aucun';const requestItem=trade.requestProperty?BOARD[trade.requestProperty].name:'Aucun';box.innerHTML=`<div class="action-title">Échange en attente</div><div class="action-text"><strong>${from.name}</strong> propose ${trade.offerCash} 💰 et ${offerItem} contre ${trade.requestCash} 💰 et ${requestItem} de <strong>${to.name}</strong>.</div>`;if(myPlayerId===trade.toId){box.innerHTML+=`<div class="action-buttons"><button class="btn btn-primary" onclick="acceptTrade()">Accepter</button><button class="btn btn-secondary" onclick="declineTrade()">Refuser</button></div>`;}panel.appendChild(box);} 

async function payBail(){const game=currentGame;const playerIndex=game.players.findIndex(p=>p.id===myPlayerId);const player=currentGame.players[playerIndex];if(player.cash < 120){toast('Pas assez pour payer la caution.');return;}const updates=nextTurnUpdates(game,{[`players/${playerIndex}/cash`]:player.cash-120,[`players/${playerIndex}/inJail`]:false,[`players/${playerIndex}/jailTurns`]:0});await update(getGameRef(game.code),updates);pushHistory(game.code,`${player.name} paie 120 💰 pour sortir de prison.`);} 

async function serveJailTurn(){const game=currentGame;const playerIndex=game.players.findIndex(p=>p.id===myPlayerId);const player=currentGame.players[playerIndex];const remaining=Math.max(0,player.jailTurns-1);const updates={[`players/${playerIndex}/jailTurns`]:remaining,currentAction:null,turnIndex:(game.turnIndex+1)%game.players.length,turnDeadline:Date.now()+game.turnTimer*1000,updatedAt:Date.now()};if(remaining===0){updates[`players/${playerIndex}/inJail`]=false;}await update(getGameRef(game.code),updates);pushHistory(game.code,`${player.name} reste en prison pour un tour de plus.`);} 

async function startGame(){if(!currentGame||!isHost) return;if(currentGame.players.length < 2){toast('Il faut au moins 2 joueurs pour démarrer.');return;}await update(getGameRef(currentGame.code),{phase:'playing',turnIndex:0,currentAction:null,turnDeadline:Date.now()+currentGame.turnTimer*1000,updatedAt:Date.now()});}
async function deleteGame(){if(!currentGame) {show('s-home');return;}if(!confirm('Supprimer la partie ?')) return;await remove(getGameRef(currentGame.code));clearLocal();show('s-home');}

function copyCode(){if(!myCode) return;navigator.clipboard.writeText(myCode).then(()=>toast('Code copié !'));}

function sendChat(){const input=document.getElementById('chat-input');const text=input.value.trim();if(!text||!currentGame) return;pushChat(currentGame.code,myName,text);input.value='';}

function autoReconnect(){parseStored();if(myCode && myPlayerId){get(getGameRef(myCode)).then(snap=>{if(!snap.exists()){clearLocal();return;}const game=snap.val();const existing=game.players.find(p=>p.id===myPlayerId);if(existing){myName=existing.name;myColor=existing.color;isHost=game.hostId===myPlayerId;saveLocal();attachPresence();startGameListener(myCode);if(game.phase==='lobby') show('s-lobby'); else show('s-game');} else {clearLocal();}});}}

Object.assign(window,{
  show,createGame,joinGame,copyCode,startGame,deleteGame,sendChat,
  closeAuctionModal,openAuctionModal,placeBid,closeTradeModal,proposeTrade,acceptTrade,
  declineTrade,payBail,serveJailTurn,openTradeModal,rollDice,buyProperty,startAuction
});

function updateAuctionCountdown(auction){const countdown=document.getElementById('auction-countdown');const status=document.getElementById('auction-status');if(auctionTimer) clearInterval(auctionTimer);function tick(){const remaining=Math.max(0,Math.round((auction.endAt-Date.now())/1000));countdown.textContent=`${remaining}s`;status.textContent=remaining?`Temps restant`:'Calcul en cours...';if(remaining<=0){clearInterval(auctionTimer);}}tick();auctionTimer=setInterval(tick,1000);} 

document.addEventListener('DOMContentLoaded',()=>{initBoard();parseStored();if(myCode) autoReconnect();});
