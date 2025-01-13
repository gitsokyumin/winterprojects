var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');

canvas.width = window.innerWidth -100;
canvas.height = window.innerHeight -100;


//주인공 객체
var CODEX = {
    x : 10,
    y : 200,
    width : 50,
    height : 50,
    draw(){
        ctx.fillStyle = 'green';
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}


// 장애물 객체
class Huddle {
    constructor(){
        this.x = 500;
        this.y = 200;
        this.width = 50;
        this.height = 50;
    }
    draw(){
        ctx.fillStyle = 'red';
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

var timer = 0; // 시간재는 타이머
var Huddlemultiple = []; // 장애물 어레이
var jumptimer = 0; // 점프 시간 재는 타이머
var animation; // 애니매이션 변수

// 애니메이션 만드는 함수
function CODEXAnimation(){
    animation = requestAnimationFrame(CODEXAnimation);
    timer++;
    
    ctx.clearRect(0,0, canvas.width, canvas.height);

     // 장애물 생성
    if(timer % 240 === 0){
        var huddle = new Huddle();
        Huddlemultiple.push(huddle);
    }
   
    // 장애물 지우기 & 이동
    Huddlemultiple.forEach((a, i, o)=>{
        if (a.x < 0){
            o.splice(i, 1)
        }
        a.x -=5;
        collsion(CODEX, a);
    
       a.draw();
    })   

    // 점프기능

    if (jumping == true){
        CODEX.y-=5;
        jumptimer++;
    }

    if (jumping == false){
        if (CODEX.y < 200){
            CODEX.y+=5
        }
    }

    if (jumptimer > 25){
        jumping = false;
        jumptimer = 0    
    }

    CODEX.draw()
}

CODEXAnimation();


//collision check
function collsion(CODEX, huddle){
    var xdifference = huddle.x - (CODEX.x + CODEX.width);
    var ydiffernece = huddle.y - (CODEX.y + CODEX.height);

    if (xdifference < 0 && ydiffernece <0){
        ctx.clearRect(0,0, canvas.width, canvas.height);
        cancelAnimationFrame(animation)

    }
}

var jumping = false;
document.addEventListener('keydown', function(e){
    if (e.code === 'Space'){
        jumping = true;
    }
})