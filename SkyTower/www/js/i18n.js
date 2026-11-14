// Translations. Each row: key, Korean, English, Japanese, Simplified Chinese, Spanish.
(function () {
  'use strict';
  const S = (window.SKY = window.SKY || {});
  S.LANGS = [
    { id: 'ko', name: '한국어' }, { id: 'en', name: 'English' }, { id: 'ja', name: '日本語' },
    { id: 'zh', name: '简体中文' }, { id: 'es', name: 'Español' },
  ];
  const IDX = { ko: 0, en: 1, ja: 2, zh: 3, es: 4 };
  const D = {};
  const a = (k, ko, en, ja, zh, es) => (D[k] = [ko, en, ja, zh, es]);

  // ---- menu ----
  a('menu.best', '최고 기록', 'Best', 'ベスト', '最高纪录', 'Récord');
  a('menu.coins', '보유 코인', 'Coins', 'コイン', '金币', 'Monedas');
  a('menu.play', '플레이', 'PLAY', 'プレイ', '开始', 'JUGAR');
  a('menu.race', 'AI 경쟁', 'AI RACE', 'AIレース', 'AI竞速', 'CARRERA IA');
  a('menu.raceSub', '90초 · AI 4명과 대결', '90s vs 4 AI rivals', '90秒・AI4体と勝負', '90秒 · 对决4名AI', '90 s contra 4 rivales');
  a('menu.wins', '우승 {n}회', '{n} wins', '優勝{n}回', '夺冠{n}次', '{n} victorias');
  a('menu.char', '캐릭터', 'Character', 'キャラ', '角色', 'Personaje');
  a('menu.shop', '상점', 'Shop', 'ショップ', '商店', 'Tienda');
  a('menu.settings', '설정', 'Settings', '設定', '设置', 'Ajustes');
  a('fmt.floor', '{n}층', '{n}F', '{n}階', '{n}层', '{n} pisos');
  a('unit.floor', '층', 'F', '階', '层', 'P');

  // ---- HUD ----
  a('hud.next', '다음 보상 {f}층 · {n}층 남음', 'Next reward at {f}F · {n} to go', '次の報酬 {f}階・あと{n}階', '下个奖励 {f}层 · 还差{n}层', 'Premio en piso {f} · faltan {n}');
  a('hud.allDone', '모든 보상 달성!', 'All rewards earned!', '全報酬達成！', '已获得全部奖励！', '¡Todos los premios!');
  a('hud.bestTag', '최고 기록', 'BEST', 'ベスト', '最高', 'RÉCORD');
  a('hud.lavaSlow', '용암 둔화', 'Lava slowed', '溶岩スロー', '熔岩减速', 'Lava frenada');
  a('hud.pause', '일시 정지', 'Pause', '一時停止', '暂停', 'Pausa');
  a('hud.shield', '보호막 발동!', 'Shield saved you!', 'シールド発動！', '护盾生效！', '¡Escudo activado!');
  a('hud.beacon', '용암이 잠시 느려져요!', 'The lava slows down for a moment!', '溶岩が少し遅くなる！', '熔岩暂时变慢了！', '¡La lava se frena un momento!');
  a('hint.1', '얼음 발판 — 미끄러워요', 'Ice — it\'s slippery', '氷の足場 — すべる！', '冰面 — 很滑', 'Hielo: ¡resbala!');
  a('hint.2', '점프 발판 — 높이 튕겨 올라요', 'Bounce pad — launches you high', 'ジャンプ台 — 高く跳ねる', '弹跳板 — 高高弹起', 'Trampolín: te lanza alto');
  a('hint.3', '무너지는 발판 — 빨리 떠나세요', 'Crumbling — move fast!', '崩れる足場 — 急いで！', '碎裂平台 — 快离开', 'Se derrumba: ¡rápido!');
  a('hint.4', '속도 발판 — 잠깐 빨라져요', 'Speed pad — a short boost', 'スピード台 — 一瞬加速', '加速板 — 短暂加速', 'Turbo: acelera un rato');
  a('hint.5', '폭발 발판 — 곧 터져요!', 'Bomb — about to blow!', '爆発する足場 — もうすぐ爆発！', '爆炸平台 — 即将爆炸！', 'Bomba: ¡va a explotar!');
  a('ms.title', '{f}층 달성 보상', 'Floor {f} reward', '{f}階 到達報酬', '{f}层 达成奖励', 'Premio del piso {f}');
  a('ms.coins', '+{n} 코인', '+{n} coins', '+{n} コイン', '+{n} 金币', '+{n} monedas');
  a('ms.unlock', '{items} 해금!', '{items} unlocked!', '{items} 解放！', '解锁 {items}！', '¡{items} desbloqueado!');
  a('ms.coinsItem', '코인 {n}', '{n} coins', 'コイン{n}', '金币{n}', '{n} monedas');
  a('env.sub', '{f}층 도달 · 용암 둔화', 'Floor {f} · lava slowed', '{f}階到達・溶岩スロー', '到达{f}层 · 熔岩减速', 'Piso {f} · lava frenada');
  a('env.sky', '하늘 섬', 'Sky Islands', '天空の島', '天空群岛', 'Islas del Cielo');
  a('env.desert', '사막 하늘', 'Desert Skies', '砂漠の空', '沙漠天空', 'Cielos del Desierto');
  a('env.frozen', '얼어붙은 산맥', 'Frozen Mountains', '凍てつく山脈', '冰封山脉', 'Montañas Heladas');
  a('env.volcano', '화산 지대', 'Volcanic World', '火山地帯', '火山世界', 'Mundo Volcánico');
  a('env.space', '우주 공간', 'Outer Space', '宇宙空間', '外太空', 'Espacio Exterior');

  // ---- pause / game over ----
  a('pause.title', '일시 정지', 'Paused', '一時停止', '已暂停', 'Pausa');
  a('pause.best', '최고 {v}', 'Best {v}', 'ベスト {v}', '最高 {v}', 'Récord {v}');
  a('pause.resume', '계속하기', 'Resume', '再開', '继续', 'Continuar');
  a('pause.restart', '다시 시작', 'Restart', 'やり直す', '重新开始', 'Reiniciar');
  a('pause.quit', '메인 메뉴', 'Main menu', 'メインメニュー', '主菜单', 'Menú principal');
  a('over.tag', '게임 오버', 'Game over', 'ゲームオーバー', '游戏结束', 'Fin del juego');
  a('over.record', '신기록!', 'New record!', '新記録！', '新纪录！', '¡Nuevo récord!');
  a('over.picked', '주운 코인', 'Coins picked up', '拾ったコイン', '拾取金币', 'Monedas recogidas');
  a('over.bonus', '층수 보너스', 'Floor bonus', '階数ボーナス', '楼层奖励', 'Bono de pisos');
  a('over.earned', '획득 코인', 'Earned', '獲得コイン', '获得金币', 'Ganado');
  a('over.again', '한 층 더!', 'One more floor!', 'あと1階！', '再上一层！', '¡Un piso más!');
  a('over.cmpNew', '이전 최고 {p}보다 {d}층 더 올랐어요!', '{d} floors above your old best ({p})!', '前回のベスト{p}より{d}階アップ！', '比之前最高{p}多爬了{d}层！', '¡{d} pisos más que tu récord ({p})!');
  a('over.cmpFirst', '첫 기록을 세웠어요!', 'Your first record!', '初めての記録！', '创下首个纪录！', '¡Tu primer récord!');
  a('over.cmpSame', '최고 기록 {p}과 같아요. 딱 한 층만 더!', 'Tied your best ({p}). Just one more floor!', 'ベスト{p}と同じ。あと1階！', '追平最高{p}。再多一层！', 'Igualaste tu récord ({p}). ¡Un piso más!');
  a('over.cmpClose', '최고 기록까지 딱 {d}층!', 'Only {d} floors from your best!', 'ベストまであと{d}階！', '离最高纪录只差{d}层！', '¡A solo {d} pisos de tu récord!');
  a('over.cmpBest', '최고 기록 {p}', 'Best: {p}', 'ベスト: {p}', '最高纪录: {p}', 'Récord: {p}');
  a('over.reward', '{f}층 보상: {label}', 'Floor {f}: {label}', '{f}階報酬: {label}', '{f}层奖励: {label}', 'Piso {f}: {label}');

  // ---- customize / shop ----
  a('coll.shop', '상점', 'Shop', 'ショップ', '商店', 'Tienda');
  a('coll.custom', '캐릭터 꾸미기', 'Customize', 'カスタマイズ', '自定义角色', 'Personalizar');
  a('tab.skin', '스킨', 'Skins', 'スキン', '皮肤', 'Aspectos');
  a('tab.theme', '발판 테마', 'Platforms', '足場テーマ', '平台主题', 'Plataformas');
  a('tab.reward', '층수 보상', 'Rewards', '階数報酬', '楼层奖励', 'Premios');
  a('coll.more', '상점에서 {n}개 더 잠금 해제', 'Unlock {n} more in the shop', 'ショップであと{n}個解放', '在商店再解锁{n}个', 'Desbloquea {n} más en la tienda');
  a('coll.allOwned', '모두 잠금 해제했어요!', 'You own everything!', '全部解放済み！', '已全部解锁！', '¡Lo tienes todo!');
  a('coll.msPrice', '{f}층 보상', 'Floor {f}', '{f}階報酬', '{f}层奖励', 'Piso {f}');
  a('coll.reach', '{f}층에 도달하면 획득', 'Reach floor {f} to unlock', '{f}階到達で入手', '到达{f}层解锁', 'Llega al piso {f}');
  a('coll.short', '코인 {n}개 부족', 'Need {n} more coins', 'コインが{n}枚足りない', '还差{n}金币', 'Faltan {n} monedas');
  a('coll.buy', '{n} 코인으로 구매', 'Buy for {n}', '{n}コインで購入', '花{n}金币购买', 'Comprar por {n}');
  a('coll.equipped', '착용 중', 'Equipped', '装備中', '已装备', 'Equipado');
  a('coll.equip', '착용하기', 'Equip', '装備する', '装备', 'Equipar');
  a('coll.best', '최고 기록 {v}', 'Best: {v}', 'ベスト: {v}', '最高纪录: {v}', 'Récord: {v}');
  a('rw.done', '획득', 'Got it', '獲得', '已获得', 'Logrado');
  a('rw.todo', '미달성', 'Locked', '未達成', '未达成', 'Pendiente');
  a('ab.none', '능력 없음', 'No ability', '能力なし', '无能力', 'Sin habilidad');
  a('rar.c', '일반', 'Common', 'コモン', '普通', 'Común');
  a('rar.r', '희귀', 'Rare', 'レア', '稀有', 'Raro');
  a('rar.e', '영웅', 'Epic', 'エピック', '史诗', 'Épico');
  a('rar.l', '전설', 'Legendary', 'レジェンド', '传说', 'Legendario');
  a('rar.m', '기념', 'Trophy', '記念', '纪念', 'Trofeo');

  // ---- settings ----
  a('set.title', '설정', 'Settings', '設定', '设置', 'Ajustes');
  a('set.lang', '언어', 'Language', '言語', '语言', 'Idioma');
  a('set.sound', '소리', 'Sound', 'サウンド', '声音', 'Sonido');
  a('vol.master', '전체', 'Master', '全体', '总音量', 'General');
  a('vol.bgm', '배경 음악', 'Music', 'BGM', '背景音乐', 'Música');
  a('vol.jump', '점프', 'Jump', 'ジャンプ', '跳跃', 'Salto');
  a('vol.land', '착지', 'Landing', '着地', '落地', 'Aterrizaje');
  a('vol.coin', '코인', 'Coins', 'コイン', '金币', 'Monedas');
  a('vol.collapse', '발판 붕괴', 'Crumble', '崩落', '平台崩塌', 'Derrumbe');
  a('vol.warn', '용암 경고', 'Lava alarm', '溶岩警告', '熔岩警报', 'Alarma de lava');
  a('vol.over', '게임 오버', 'Game over', 'ゲームオーバー', '游戏结束', 'Fin del juego');
  a('vol.fx', '기타 효과음', 'Other effects', 'その他効果音', '其他音效', 'Otros efectos');
  a('set.controls', '조작', 'Controls', '操作', '操作', 'Controles');
  a('set.swap', '조작 좌우 반전', 'Swap sides', '左右反転', '左右互换', 'Invertir lados');
  a('set.swapSub', '이동을 오른쪽, 점프를 왼쪽으로', 'Move on the right, jump on the left', '移動を右、ジャンプを左に', '移动在右，跳跃在左', 'Mover a la derecha, saltar a la izquierda');
  a('set.one', '한 손 모드', 'One-hand mode', '片手モード', '单手模式', 'Modo una mano');
  a('set.oneSub', '화면 어디서나 드래그로 이동, 위로 밀면 점프', 'Drag anywhere to move, push up to jump', 'どこでもドラッグで移動、上に押してジャンプ', '任意位置拖动移动，向上推跳跃', 'Arrastra para moverte, empuja arriba para saltar');
  a('set.haptics', '진동', 'Vibration', '振動', '振动', 'Vibración');
  a('set.shake', '화면 흔들림', 'Screen shake', '画面の揺れ', '屏幕震动', 'Temblor de pantalla');
  a('set.graphics', '그래픽', 'Graphics', 'グラフィック', '画质', 'Gráficos');
  a('q.auto', '자동', 'Auto', '自動', '自动', 'Auto');
  a('q.low', '낮음', 'Low', '低', '低', 'Bajo');
  a('q.medium', '보통', 'Medium', '中', '中', 'Medio');
  a('q.high', '높음', 'High', '高', '高', 'Alto');
  a('set.data', '데이터', 'Data', 'データ', '数据', 'Datos');
  a('set.reset', '진행 데이터 초기화', 'Reset progress', '進行データを初期化', '重置进度', 'Borrar progreso');
  a('set.local', '모든 데이터는 이 기기에만 저장됩니다.', 'All data stays on this device.', 'データはこの端末にのみ保存されます。', '所有数据仅保存在本设备上。', 'Los datos se guardan solo en este dispositivo.');
  a('confirm.title', '정말 초기화할까요?', 'Reset everything?', '本当に初期化しますか？', '确定要重置吗？', '¿Borrar todo?');
  a('confirm.text', '코인, 최고 기록, 잠금 해제한 스킨과 테마가 모두 삭제되며 되돌릴 수 없습니다.', 'Coins, records, skins and themes will be deleted. This can\'t be undone.', 'コイン・記録・スキン・テーマがすべて消え、元に戻せません。', '金币、纪录、皮肤和主题都会被删除，且无法恢复。', 'Se borrarán monedas, récords, aspectos y temas. No se puede deshacer.');
  a('confirm.yes', '초기화', 'Reset', '初期化', '重置', 'Borrar');
  a('confirm.no', '취소', 'Cancel', 'キャンセル', '取消', 'Cancelar');
  a('fatal.title', '이 기기에서는 실행할 수 없어요', 'This device can\'t run the game', 'この端末では起動できません', '此设备无法运行游戏', 'Este dispositivo no puede ejecutar el juego');
  a('fatal.text', '이 게임은 WebGL 2를 지원하는 기기가 필요합니다.', 'The game needs WebGL 2 support.', 'WebGL 2 対応の端末が必要です。', '本游戏需要支持 WebGL 2 的设备。', 'Necesita un dispositivo compatible con WebGL 2.');
  a('common.back', '뒤로', 'Back', '戻る', '返回', 'Atrás');
  a('common.close', '닫기', 'Close', '閉じる', '关闭', 'Cerrar');
  a('lang.sub', '나중에 설정에서 바꿀 수 있어요', 'You can change this later in Settings', '後で設定から変更できます', '之后可在设置中更改', 'Puedes cambiarlo luego en Ajustes');

  // ---- race ----
  a('race.goal', '90초 동안 가장 높이!', 'Climb highest in 90 seconds!', '90秒で一番高く！', '90秒内爬得最高！', '¡Sube lo más alto en 90 s!');
  a('race.tip', '부딪혀 밀치고, 머리를 밟아 점프!', 'Bump rivals away, stomp heads to bounce!', 'ぶつかって押し出し、頭を踏んでジャンプ！', '撞开对手，踩头弹跳！', '¡Empuja rivales y salta sobre sus cabezas!');
  a('race.go', '출발!', 'GO!', 'スタート！', '出发！', '¡YA!');
  a('race.you', '나', 'You', 'あなた', '你', 'Tú');
  a('race.rank', '{r}위', '{o}', '{r}位', '第{r}名', '{r}.º');
  a('race.out', '탈락', 'Out', '脱落', '出局', 'Fuera');
  a('race.timeUp', '시간 종료!', 'Time\'s up!', 'タイムアップ！', '时间到！', '¡Tiempo!');
  a('race.win', '우승!', 'You win!', '優勝！', '夺冠！', '¡Ganaste!');
  a('race.again', '한 판 더!', 'Race again!', 'もう一回！', '再来一局！', '¡Otra carrera!');
  a('race.rankReward', '순위 보상', 'Placement reward', '順位報酬', '名次奖励', 'Premio por puesto');
  a('race.lead', '선두!', 'In the lead!', 'トップ！', '领先！', '¡En cabeza!');
  a('race.overtake', '추월!', 'Overtake!', '追い抜き！', '超越！', '¡Adelantas!');
  a('race.stomp', '밟기!', 'Stomp!', '踏みつけ！', '踩踏！', '¡Pisotón!');
  a('race.stomped', '밟혔다!', 'Stomped!', '踏まれた！', '被踩了！', '¡Te pisaron!');

  // ---- versus / online / elevator / nickname ----
  a('menu.versus', '대전', 'VERSUS', '対戦', '对战', 'DUELO');
  a('menu.versusSub', 'AI대전 · 일반대전 · 랭크전', 'AI · Casual · Ranked', 'AI・カジュアル・ランク', 'AI · 普通 · 排位', 'IA · Casual · Clasificatoria');
  a('vs.title', '대전', 'Versus', '対戦', '对战', 'Duelo');
  a('vs.ai', 'AI대전', 'AI Race', 'AI対戦', 'AI对战', 'Carrera IA');
  a('vs.aiSub', 'AI 레벨 {lv} · 우승 {n}회', 'AI level {lv} · {n} wins', 'AIレベル{lv}・優勝{n}回', 'AI等级{lv} · 夺冠{n}次', 'Nivel IA {lv} · {n} victorias');
  a('vs.casual', '일반대전', 'Casual', 'カジュアル対戦', '普通对战', 'Casual');
  a('vs.casualSub', '온라인 5인 · 우승 {n}회', 'Online, 5 players · {n} wins', 'オンライン5人・優勝{n}回', '在线5人 · 夺冠{n}次', 'En línea, 5 jugadores · {n} victorias');
  a('vs.ranked', '랭크전', 'Ranked', 'ランク戦', '排位赛', 'Clasificatoria');
  a('vs.rankedSub', '{tier} · {rp} RP', '{tier} · {rp} RP', '{tier}・{rp} RP', '{tier} · {rp} RP', '{tier} · {rp} RP');
  a('vs.locked', '일반대전 {n}/5승 시 해금', 'Unlocks at 5 casual wins ({n}/5)', 'カジュアル5勝で解放（{n}/5）', '普通对战5胜解锁（{n}/5）', 'Se desbloquea con 5 victorias casuales ({n}/5)');
  a('vs.noServer', '온라인 서버가 설정되지 않았어요', 'No online server is set up', 'オンラインサーバーが未設定です', '尚未设置在线服务器', 'No hay servidor en línea configurado');
  a('vs.offline', '서버에 연결할 수 없어요', 'Can\'t reach the server', 'サーバーに接続できません', '无法连接服务器', 'No se puede conectar al servidor');
  a('vs.checking', '서버 확인 중…', 'Checking the server…', 'サーバー確認中…', '正在检查服务器…', 'Comprobando el servidor…');
  a('mt.searching', '상대를 찾는 중…', 'Finding rivals…', '対戦相手を検索中…', '正在寻找对手…', 'Buscando rivales…');
  a('mt.count', '{n}/5명', '{n}/5 players', '{n}/5人', '{n}/5人', '{n}/5 jugadores');
  a('mt.fill', '{s}초 후 빈자리는 AI로 채워요', 'Empty slots fill with AI in {s}s', '{s}秒後、空き枠をAIで補充します', '{s}秒后由AI补位', 'Los huecos se llenan con IA en {s} s');
  a('mt.joining', '경기장에 입장하는 중…', 'Joining the match…', '入場中…', '正在进入比赛…', 'Entrando a la partida…');
  a('mt.failed', '연결에 실패했어요', 'Connection failed', '接続に失敗しました', '连接失败', 'Falló la conexión');
  a('mt.locked', '랭크전은 일반대전 5승 후 열려요', 'Ranked opens after 5 casual wins', 'ランク戦はカジュアル5勝で解放', '普通对战5胜后开放排位赛', 'La clasificatoria se abre tras 5 victorias casuales');
  a('net.lost', '연결이 끊겼어요. 이 경기는 기록되지 않아요', 'Connection lost. This match won\'t count', '接続が切れました。この試合は記録されません', '连接已断开，本场不计入记录', 'Conexión perdida. Esta partida no cuenta');
  a('net.waiting', '다른 선수들의 결과를 기다리는 중…', 'Waiting for the others to finish…', '他の選手の結果を待っています…', '等待其他选手完成…', 'Esperando a los demás…');
  a('rr.rp', '랭크 점수', 'Rank points', 'ランクポイント', '排位分', 'Puntos de rango');
  a('rr.promoted', '{tier} 승급!', 'Promoted to {tier}!', '{tier}に昇格！', '晋升{tier}！', '¡Ascenso a {tier}!');
  a('rr.demoted', '{tier}(으)로 강등', 'Dropped to {tier}', '{tier}に降格', '降至{tier}', 'Bajas a {tier}');
  a('tier.bronze', '브론즈', 'Bronze', 'ブロンズ', '青铜', 'Bronce');
  a('tier.silver', '실버', 'Silver', 'シルバー', '白银', 'Plata');
  a('tier.gold', '골드', 'Gold', 'ゴールド', '黄金', 'Oro');
  a('tier.platinum', '플래티넘', 'Platinum', 'プラチナ', '铂金', 'Platino');
  a('tier.diamond', '다이아몬드', 'Diamond', 'ダイヤモンド', '钻石', 'Diamante');
  a('tier.master', '마스터', 'Master', 'マスター', '大师', 'Maestro');
  a('set.nick', '닉네임', 'Nickname', 'ニックネーム', '昵称', 'Apodo');
  a('set.nickSave', '저장', 'Save', '保存', '保存', 'Guardar');
  a('set.nickSaved', '닉네임을 저장했어요', 'Nickname saved', 'ニックネームを保存しました', '昵称已保存', 'Apodo guardado');
  a('elev.btn', '엘리베이터', 'Elevator', 'エレベーター', '电梯', 'Ascensor');
  a('elev.title', '엘리베이터', 'Elevator', 'エレベーター', '电梯', 'Ascensor');
  a('elev.sub', '코인을 내고 높은 층에서 시작해요. 층수 보너스는 도착한 층부터 쌓여요.', 'Pay coins to start higher up. Floor bonus counts from where you arrive.', 'コインを払って高い階から開始。階数ボーナスは到着階から加算。', '花费金币从更高楼层开始。楼层奖励从到达楼层起计算。', 'Paga para empezar más arriba. El bono de pisos cuenta desde la llegada.');
  a('elev.arrive', '{f}층 도착!', 'Arrived at floor {f}!', '{f}階に到着！', '到达{f}层！', '¡Llegaste al piso {f}!');

  // ---- abilities: name, description ----
  const ab = (id, names, descs) => { a('ab.' + id, ...names); a('abd.' + id, ...descs); };
  ab('spring', ['탄력 다리', 'Springy Legs', 'バネ足', '弹力腿', 'Piernas elásticas'], ['점프 높이 +6%', 'Jump height +6%', 'ジャンプ力+6%', '跳跃高度+6%', 'Salto +6%']);
  ab('swift', ['날쌘 발', 'Quick Feet', '俊足', '疾行', 'Pies veloces'], ['이동 속도 +7%', 'Run speed +7%', '移動速度+7%', '移动速度+7%', 'Velocidad +7%']);
  ab('feather', ['깃털 낙하', 'Feather Fall', '羽根落下', '羽落', 'Caída pluma'], ['떨어지는 속도 -14%', 'Fall 14% slower', '落下速度-14%', '下落速度-14%', 'Caes un 14% más lento']);
  ab('grip', ['미끄럼 방지', 'Ice Grip', '滑り止め', '防滑', 'Agarre'], ['얼음에서 미끄러지지 않음', 'No slipping on ice', '氷で滑らない', '冰面不打滑', 'No resbalas en el hielo']);
  ab('thrifty', ['알뜰살뜰', 'Thrifty', 'やりくり上手', '精打细算', 'Ahorrador'], ['층수 보너스 +30%', 'Floor bonus +30%', '階数ボーナス+30%', '楼层奖励+30%', 'Bono de pisos +30%']);
  ab('coiny', ['반짝 코인', 'Coin Sense', 'コイン感知', '金币感应', 'Olfato de monedas'], ['코인을 조금 더 멀리서 획득', 'Grab coins from a bit farther', '少し遠くのコインも取れる', '稍远处也能拾取金币', 'Recoges monedas desde más lejos']);
  ab('sturdy', ['튼튼한 발판', 'Steady Step', '頑丈な足場', '稳固', 'Paso firme'], ['무너지는·폭발 발판이 1.5배 늦게 반응', 'Crumble and bomb timers ×1.5', '崩れる・爆発足場の猶予×1.5', '碎裂与爆炸延迟×1.5', 'Derrumbes y bombas tardan ×1.5']);
  ab('magnet', ['코인 자석', 'Coin Magnet', 'コイン磁石', '金币磁铁', 'Imán'], ['주변 코인을 끌어당김', 'Pulls in nearby coins', '周りのコインを引き寄せる', '吸引附近金币', 'Atrae monedas cercanas']);
  ab('leap', ['개구리 점프', 'Frog Leap', 'カエル跳び', '蛙跳', 'Salto de rana'], ['점프 높이 +12%', 'Jump height +12%', 'ジャンプ力+12%', '跳跃高度+12%', 'Salto +12%']);
  ab('bouncy', ['통통', 'Bouncy', 'ぽよぽよ', '弹弹', 'Rebote'], ['점프 발판 +30%', 'Bounce pads +30%', 'ジャンプ台+30%', '弹跳板+30%', 'Trampolines +30%']);
  ab('nimble', ['잽싼 몸놀림', 'Nimble', '身軽', '灵巧', 'Ágil'], ['가장자리와 늦은 점프 판정이 넉넉함', 'Forgiving edges and late jumps', '端と遅れジャンプが有利に', '边缘与延迟起跳更宽容', 'Bordes y saltos tardíos más permisivos']);
  ab('chill', ['냉기', 'Chill', '冷気', '寒气', 'Frío'], ['수정의 용암 둔화 2배', 'Crystal slowdowns last 2×', 'クリスタルの溶岩スロー2倍', '水晶减速熔岩时间×2', 'Los cristales frenan la lava el doble']);
  ab('sprinter', ['질주 본능', 'Sprinter', '疾走本能', '冲刺本能', 'Velocista'], ['속도 발판 효과 2배', 'Speed pads twice as strong', 'スピード台効果2倍', '加速板效果×2', 'Turbos el doble de fuertes']);
  ab('lucky', ['행운', 'Lucky', 'ラッキー', '幸运', 'Suerte'], ['코인 1.5배', 'Coins ×1.5', 'コイン1.5倍', '金币×1.5', 'Monedas ×1.5']);
  ab('fireproof', ['방폭', 'Blast-proof', '防爆', '防爆', 'Antiexplosión'], ['폭발에 날아가지 않음', 'Explosions can\'t knock you away', '爆発で吹き飛ばない', '不会被爆炸炸飞', 'Las bombas no te empujan']);
  ab('double', ['2단 점프', 'Double Jump', '2段ジャンプ', '二段跳', 'Doble salto'], ['공중에서 한 번 더 점프', 'Jump once more in midair', '空中でもう1回ジャンプ', '空中再跳一次', 'Salta otra vez en el aire']);
  ab('glide', ['활공', 'Glide', '滑空', '滑翔', 'Planeo'], ['떨어질 때 점프를 누르면 천천히 활공', 'Hold jump while falling to glide', '落下中にジャンプ長押しで滑空', '下落时按住跳跃滑翔', 'Mantén saltar al caer para planear']);
  ab('shield', ['보호막', 'Shield', 'シールド', '护盾', 'Escudo'], ['용암에 한 번 빠져도 살아남', 'Survive the lava once', '溶岩に1回落ちても復活', '掉进熔岩可复活一次', 'Sobrevives a la lava una vez']);
  ab('cool', ['냉각', 'Cooling', '冷却', '冷却', 'Enfriar'], ['용암이 12% 느리게 차오름', 'Lava rises 12% slower', '溶岩の上昇12%減速', '熔岩上升减慢12%', 'La lava sube un 12% más lento']);
  ab('golden', ['황금 손', 'Golden Touch', '黄金の手', '点金手', 'Toque dorado'], ['코인 2배', 'Coins ×2', 'コイン2倍', '金币×2', 'Monedas ×2']);
  ab('antigrav', ['저중력', 'Low Gravity', '低重力', '低重力', 'Baja gravedad'], ['더 높이 뛰고 천천히 떨어짐', 'Jump higher, fall slower', '高く跳び、ゆっくり落ちる', '跳得更高，落得更慢', 'Saltas más y caes despacio']);
  ab('light', ['유령 걸음', 'Ghost Step', '幽霊歩き', '幽灵步', 'Paso fantasma'], ['위험 발판이 2배 늦게 반응, 얼음도 OK', 'Hazards wait 2× longer, no ice slip', '危険足場の猶予2倍・氷も平気', '危险平台延迟×2，冰面不滑', 'Peligros tardan 2×, sin resbalar']);
  ab('phoenix', ['불사조', 'Phoenix', '不死鳥', '不死鸟', 'Fénix'], ['용암에서 두 번 부활 + 깃털 낙하', 'Revive from lava twice + feather fall', '溶岩から2回復活＋羽根落下', '熔岩中复活两次＋羽落', 'Revive dos veces + caída pluma']);
  ab('rocket', ['로켓 부츠', 'Rocket Boots', 'ロケットブーツ', '火箭靴', 'Botas cohete'], ['3단 점프', 'Triple jump', '3段ジャンプ', '三段跳', 'Triple salto']);
  ab('midas', ['미다스', 'Midas', 'ミダス', '迈达斯', 'Midas'], ['코인 2배, 자석, 층수 보너스 +50%', 'Coins ×2, magnet, floor bonus +50%', 'コイン2倍・磁石・階数ボーナス+50%', '金币×2、磁铁、楼层奖励+50%', 'Monedas ×2, imán, bono +50%']);
  ab('nomad', ['사막의 발걸음', 'Desert Stride', '砂漠の足取り', '沙漠步伐', 'Paso del desierto'], ['빠른 발, 미끄럼 방지, 긴 질주', 'Faster, no ice slip, longer speed boosts', '俊足・滑り止め・長い加速', '更快、防滑、加速更久', 'Más rápido, sin resbalar, turbo largo']);
  ab('yeti', ['설산의 왕', 'Mountain King', '雪山の王', '雪山之王', 'Rey de la montaña'], ['2단 점프, 미끄럼 방지, 용암 -8%', 'Double jump, ice grip, lava -8%', '2段ジャンプ・滑り止め・溶岩-8%', '二段跳、防滑、熔岩-8%', 'Doble salto, agarre, lava -8%']);
  ab('golem', ['용암 심장', 'Magma Heart', 'マグマの心', '熔岩之心', 'Corazón de magma'], ['보호막, 방폭, 튼튼한 발판', 'Shield, blast-proof, steady step', 'シールド・防爆・頑丈な足場', '护盾、防爆、稳固', 'Escudo, antiexplosión, paso firme']);
  ab('lord', ['탑의 지배', 'Tower Rule', '塔の支配', '塔之统治', 'Dominio de la torre'], ['3단 점프, 코인 자석, 용암 -10%', 'Triple jump, magnet, lava -10%', '3段ジャンプ・磁石・溶岩-10%', '三段跳、磁铁、熔岩-10%', 'Triple salto, imán, lava -10%']);

  // ---- skins ----
  const names = (prefix, rows) => { for (const r of rows) a(prefix + r[0], ...r.slice(1)); };
  names('skin.', [
    ['default', '콩이', 'Bean', 'まめ', '小豆', 'Frijol'], ['mint', '민트콩', 'Mint', 'ミント', '薄荷豆', 'Menta'],
    ['coral', '산호', 'Coral', 'コーラル', '珊瑚', 'Coral'], ['skyblue', '소라', 'Sora', 'ソラ', '小天', 'Celeste'],
    ['grape', '포도', 'Grape', 'ぶどう', '葡萄', 'Uva'], ['lime', '라임', 'Lime', 'ライム', '青柠', 'Lima'],
    ['peach', '복숭아', 'Peach', 'もも', '蜜桃', 'Melocotón'], ['cocoa', '코코아', 'Cocoa', 'ココア', '可可', 'Cacao'],
    ['bot', '철이', 'Bolt', 'ボルト', '铁蛋', 'Tornillo'], ['frog', '개굴', 'Ribbit', 'ケロ', '呱呱', 'Rana'],
    ['cat', '치즈냥', 'Cheddar', 'チーズ猫', '芝士猫', 'Queso'], ['bunny', '토순이', 'Bunbun', 'うさこ', '兔兔', 'Conejita'],
    ['penguin', '펭수리', 'Pengo', 'ペンタ', '企鹅君', 'Pingüi'], ['heli', '콥터', 'Copter', 'コプター', '直升机', 'Hélice'],
    ['wizard', '마법콩', 'Wizzy', 'まほう豆', '魔法豆', 'Mago'], ['party', '파티콩', 'Party', 'パーティ', '派对豆', 'Fiesta'],
    ['knight', '기사단장', 'Sir Knight', '騎士団長', '骑士团长', 'Caballero'], ['king', '임금님', 'King', '王様', '国王', 'Rey'],
    ['devil', '꼬마악마', 'Imp', '小悪魔', '小恶魔', 'Diablillo'], ['angel', '천사', 'Angel', '天使', '天使', 'Ángel'],
    ['ninja', '그림자', 'Shadow', '影', '影子', 'Sombra'], ['alien', '외계콩', 'Alien', '宇宙人', '外星豆', 'Alien'],
    ['ghost', '둥실이', 'Boo', 'ふわり', '飘飘', 'Fantasma'], ['flame', '불꽃정령', 'Flare', '炎の精', '火焰精灵', 'Llama'],
    ['galaxy', '은하수', 'Galaxy', '銀河', '银河', 'Galaxia'], ['gold', '황금콩', 'Goldie', '金まめ', '黄金豆', 'Dorado'],
    ['nomad', '사막 여행자', 'Nomad', '砂漠の旅人', '沙漠旅人', 'Nómada'], ['yeti', '설산 탐험가', 'Yeti', '雪山探検家', '雪山探险家', 'Yeti'],
    ['golem', '용암 골렘', 'Lava Golem', '溶岩ゴーレム', '熔岩魔像', 'Gólem de lava'], ['lord', '탑의 지배자', 'Tower Lord', '塔の支配者', '塔之主宰', 'Señor de la torre'],
  ]);
  names('theme.', [
    ['classic', '초원', 'Meadow', '草原', '草地', 'Pradera'], ['cloud', '솜구름', 'Cotton Cloud', 'わたぐも', '棉花云', 'Nube'],
    ['candy', '사탕', 'Candy', 'キャンディ', '糖果', 'Caramelo'], ['wood', '원목', 'Timber', '木材', '原木', 'Madera'],
    ['sand', '사암', 'Sandstone', '砂岩', '砂岩', 'Arenisca'], ['marble', '대리석', 'Marble', '大理石', '大理石', 'Mármol'],
    ['steel', '강철', 'Steel', '鋼鉄', '钢铁', 'Acero'], ['neon', '네온', 'Neon', 'ネオン', '霓虹', 'Neón'],
    ['crystal', '수정', 'Crystal', 'クリスタル', '水晶', 'Cristal'], ['gold', '황금', 'Gold', '黄金', '黄金', 'Oro'],
  ]);

  // ---- API ----
  S.lang = 'ko';
  const ORD = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
  S.t = (k, vars) => {
    const row = D[k];
    let s = row ? row[IDX[S.lang]] || row[1] || row[0] : k;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, n) => (vars[n] !== undefined ? vars[n] : m));
    return s;
  };
  S.fl = (n) => S.t('fmt.floor', { n });
  S.rankText = (r) => S.t('race.rank', { r, o: ORD(r) });
  S.nameOf = (kind, item) => S.t(kind + '.' + item.id);
  S.abName = (id) => (id ? S.t('ab.' + id) : S.t('ab.none'));
  S.abDesc = (id) => (id ? S.t('abd.' + id) : '');
  S.abIcon = (id) => (id && S.ABILITIES[id] ? S.ABILITIES[id].icon : '');
  S.milestoneLabel = (m) => {
    const parts = [S.t('ms.coinsItem', { n: m.coins.toLocaleString() })];
    if (m.skin) parts.push(S.t('skin.' + m.skin));
    if (m.theme) parts.push(S.t('theme.' + m.theme));
    return parts.join(' + ');
  };
  S.detectLang = () => {
    const l = String(navigator.language || 'en').toLowerCase();
    for (const id of ['ko', 'ja', 'zh', 'es']) if (l.startsWith(id)) return id;
    return 'en';
  };
  S.applyI18n = (root) => {
    const r = root || document;
    r.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = S.t(el.dataset.i18n); });
    r.querySelectorAll('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', S.t(el.dataset.i18nAria)));
    document.documentElement.lang = S.lang === 'zh' ? 'zh-CN' : S.lang;
  };
})();
