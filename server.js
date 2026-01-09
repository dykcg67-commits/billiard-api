// ============================================
// 당구장 점수판 시스템 - Node.js Backend
// Express + MySQL
// ============================================

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// 미들웨어 설정
// ============================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// MySQL 연결 풀 생성
// ============================================

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 데이터베이스 연결 테스트
pool.getConnection()
  .then(connection => {
    console.log('✅ MySQL 연결 성공!');
    connection.release();
  })
  .catch(err => {
    console.error('❌ MySQL 연결 실패:', err);
  });

// ============================================
// 헬스 체크
// ============================================

app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: '당구장 점수판 API 서버',
    version: '1.0.0',
    status: 'running'
  });
});

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'healthy' });
});

// ============================================
// API 엔드포인트
// ============================================

// 회원가입
app.post('/api/register', async (req, res) => {
  try {
    const { nickname, target = 25 } = req.body;

    if (!nickname || nickname.length < 2 || nickname.length > 10) {
      return res.status(400).json({
        success: false,
        message: '닉네임은 2-10자여야 합니다.'
      });
    }

    // 중복 체크
    const [rows] = await pool.query(
      'SELECT id FROM users WHERE nickname = ?',
      [nickname]
    );

    if (rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: '이미 존재하는 닉네임입니다.'
      });
    }

    // 회원가입
    await pool.query(
      'INSERT INTO users (nickname, target) VALUES (?, ?)',
      [nickname, target]
    );

    res.json({
      success: true,
      message: '회원가입이 완료되었습니다.',
      user: {
        nickname,
        target,
        wins: 0,
        losses: 0
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: '회원가입 실패: ' + error.message
    });
  }
});

// 로그인
app.post('/api/login', async (req, res) => {
  try {
    const { nickname } = req.body;

    if (!nickname) {
      return res.status(400).json({
        success: false,
        message: '닉네임을 입력해주세요.'
      });
    }

    const [rows] = await pool.query(
      'SELECT nickname, target, wins, losses FROM users WHERE nickname = ?',
      [nickname]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '존재하지 않는 닉네임입니다.'
      });
    }

    res.json({
      success: true,
      message: '로그인 성공',
      user: rows[0]
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: '로그인 실패: ' + error.message
    });
  }
});

// 테이블 목록 조회
app.get('/api/getTables', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        table_num as tableNum,
        status,
        player1,
        player2,
        score1,
        score2,
        target1,
        target2,
        color1,
        color2,
        current_turn as currentTurn,
        inning,
        start_time as startTime
      FROM tables 
      ORDER BY table_num
    `);

    res.json({
      success: true,
      tables: rows
    });

  } catch (error) {
    console.error('GetTables error:', error);
    res.status(500).json({
      success: false,
      message: '테이블 조회 실패: ' + error.message
    });
  }
});

// 방 만들기
app.post('/api/createRoom', async (req, res) => {
  try {
    const { tableNum, nickname, target = 25 } = req.body;

    if (!tableNum || !nickname) {
      return res.status(400).json({
        success: false,
        message: '테이블 번호와 닉네임이 필요합니다.'
      });
    }

    // 테이블 상태 확인
    const [rows] = await pool.query(
      'SELECT status FROM tables WHERE table_num = ?',
      [tableNum]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '존재하지 않는 테이블입니다.'
      });
    }

    if (rows[0].status !== 'available') {
      return res.status(400).json({
        success: false,
        message: '이미 사용 중인 테이블입니다.'
      });
    }

    // 방 생성
    await pool.query(
      'UPDATE tables SET status = ?, player1 = ?, target1 = ? WHERE table_num = ?',
      ['waiting', nickname, target, tableNum]
    );

    res.json({
      success: true,
      message: '방이 생성되었습니다.'
    });

  } catch (error) {
    console.error('CreateRoom error:', error);
    res.status(500).json({
      success: false,
      message: '방 생성 실패: ' + error.message
    });
  }
});

// 입장 요청
app.post('/api/joinRoom', async (req, res) => {
  try {
    const { tableNum, nickname } = req.body;

    const [rows] = await pool.query(
      'SELECT status FROM tables WHERE table_num = ?',
      [tableNum]
    );

    if (rows.length === 0 || rows[0].status !== 'waiting') {
      return res.status(400).json({
        success: false,
        message: '입장할 수 없는 테이블입니다.'
      });
    }

    await pool.query(
      'UPDATE tables SET player2 = ? WHERE table_num = ?',
      [nickname, tableNum]
    );

    res.json({
      success: true,
      message: '입장 요청이 전송되었습니다.'
    });

  } catch (error) {
    console.error('JoinRoom error:', error);
    res.status(500).json({
      success: false,
      message: '입장 요청 실패: ' + error.message
    });
  }
});

// 입장 승인
app.post('/api/approveJoin', async (req, res) => {
  try {
    const { tableNum, target = 20 } = req.body;

    await pool.query(
      'UPDATE tables SET target2 = ? WHERE table_num = ?',
      [target, tableNum]
    );

    res.json({
      success: true,
      message: '입장이 승인되었습니다.'
    });

  } catch (error) {
    console.error('ApproveJoin error:', error);
    res.status(500).json({
      success: false,
      message: '입장 승인 실패: ' + error.message
    });
  }
});

// 색상 설정 및 게임 시작
app.post('/api/setColors', async (req, res) => {
  try {
    const { tableNum, color1, color2 } = req.body;
    const starter = color2 === 'white' ? 'player2' : 'player1';

    await pool.query(`
      UPDATE tables 
      SET status = 'occupied',
          color1 = ?,
          color2 = ?,
          current_turn = ?,
          inning = 1,
          start_time = NOW()
      WHERE table_num = ?
    `, [color1, color2, starter, tableNum]);

    res.json({
      success: true,
      message: '게임이 시작되었습니다.',
      currentTurn: starter
    });

  } catch (error) {
    console.error('SetColors error:', error);
    res.status(500).json({
      success: false,
      message: '게임 시작 실패: ' + error.message
    });
  }
});

// 게임 상태 조회
app.post('/api/getGameState', async (req, res) => {
  try {
    const { tableNum } = req.body;

    const [rows] = await pool.query(
      'SELECT * FROM tables WHERE table_num = ?',
      [tableNum]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '테이블을 찾을 수 없습니다.'
      });
    }

    const table = rows[0];

    res.json({
      success: true,
      game: {
        tableNum: table.table_num,
        status: table.status,
        player1: table.player1,
        player2: table.player2,
        score1: table.score1,
        score2: table.score2,
        target1: table.target1,
        target2: table.target2,
        color1: table.color1,
        color2: table.color2,
        currentTurn: table.current_turn,
        inning: table.inning,
        startTime: table.start_time
      }
    });

  } catch (error) {
    console.error('GetGameState error:', error);
    res.status(500).json({
      success: false,
      message: '게임 상태 조회 실패: ' + error.message
    });
  }
});

// 점수 업데이트
app.post('/api/updateScore', async (req, res) => {
  try {
    const { tableNum, score } = req.body;

    const [rows] = await pool.query(
      'SELECT current_turn FROM tables WHERE table_num = ?',
      [tableNum]
    );

    const col = rows[0].current_turn === 'player1' ? 'score1' : 'score2';

    await pool.query(
      `UPDATE tables SET ${col} = ? WHERE table_num = ?`,
      [score, tableNum]
    );

    res.json({
      success: true,
      message: '점수가 업데이트되었습니다.'
    });

  } catch (error) {
    console.error('UpdateScore error:', error);
    res.status(500).json({
      success: false,
      message: '점수 업데이트 실패: ' + error.message
    });
  }
});

// 턴 넘기기
app.post('/api/nextTurn', async (req, res) => {
  try {
    const { tableNum } = req.body;

    const [rows] = await pool.query(
      'SELECT current_turn, score1, score2, target1, target2, inning FROM tables WHERE table_num = ?',
      [tableNum]
    );

    const table = rows[0];

    // 승리 조건 체크
    if (table.score1 >= table.target1) {
      return res.json({
        success: true,
        gameOver: true,
        winner: 'player1'
      });
    }

    if (table.score2 >= table.target2) {
      return res.json({
        success: true,
        gameOver: true,
        winner: 'player2'
      });
    }

    // 턴 전환
    const nextTurn = table.current_turn === 'player1' ? 'player2' : 'player1';
    const nextInning = nextTurn === 'player1' ? table.inning + 1 : table.inning;

    await pool.query(
      'UPDATE tables SET current_turn = ?, inning = ? WHERE table_num = ?',
      [nextTurn, nextInning, tableNum]
    );

    res.json({
      success: true,
      gameOver: false,
      message: '턴이 넘어갔습니다.'
    });

  } catch (error) {
    console.error('NextTurn error:', error);
    res.status(500).json({
      success: false,
      message: '턴 넘기기 실패: ' + error.message
    });
  }
});

// 게임 종료
app.post('/api/endGame', async (req, res) => {
  try {
    const { tableNum } = req.body;

    // 게임 데이터 가져오기
    const [rows] = await pool.query(
      'SELECT * FROM tables WHERE table_num = ?',
      [tableNum]
    );

    const table = rows[0];
    const winner = table.score1 >= table.target1 ? table.player1 : table.player2;

    // 경기 기록 저장
    await pool.query(`
      INSERT INTO games 
      (table_num, player1, player2, score1, score2, winner, start_time) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      table.table_num,
      table.player1,
      table.player2,
      table.score1,
      table.score2,
      winner,
      table.start_time
    ]);

    // 테이블 초기화
    await pool.query(`
      UPDATE tables 
      SET status = 'available',
          player1 = NULL,
          player2 = NULL,
          score1 = 0,
          score2 = 0,
          target1 = 0,
          target2 = 0,
          color1 = NULL,
          color2 = NULL,
          current_turn = NULL,
          inning = 0,
          start_time = NULL
      WHERE table_num = ?
    `, [tableNum]);

    res.json({
      success: true,
      message: '경기가 종료되었습니다.'
    });

  } catch (error) {
    console.error('EndGame error:', error);
    res.status(500).json({
      success: false,
      message: '게임 종료 실패: ' + error.message
    });
  }
});

// 방 취소
app.post('/api/cancelRoom', async (req, res) => {
  try {
    const { tableNum } = req.body;

    await pool.query(`
      UPDATE tables 
      SET status = 'available',
          player1 = NULL,
          player2 = NULL,
          score1 = 0,
          score2 = 0,
          target1 = 0,
          target2 = 0,
          color1 = NULL,
          color2 = NULL,
          current_turn = NULL,
          inning = 0,
          start_time = NULL
      WHERE table_num = ?
    `, [tableNum]);

    res.json({
      success: true,
      message: '방이 취소되었습니다.'
    });

  } catch (error) {
    console.error('CancelRoom error:', error);
    res.status(500).json({
      success: false,
      message: '방 취소 실패: ' + error.message
    });
  }
});

// ============================================
// 404 핸들러
// ============================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '요청한 API를 찾을 수 없습니다.'
  });
});

// ============================================
// 에러 핸들러
// ============================================

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: '서버 에러: ' + err.message
  });
});

// ============================================
// 서버 시작
// ============================================

app.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎱 당구장 점수판 API 서버 시작!');
  console.log(`📡 포트: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
