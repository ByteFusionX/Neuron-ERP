import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, AfterViewInit } from '@angular/core';

@Component({
    selector: 'app-confetti-component',
    templateUrl: './confetti-component.component.html',
    styles: [`
    :host {
      display: block;
      position: absolute;
      width: 100%;
      height: 100%;
    }

    canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 0; 
    }
  `],
    imports: [CommonModule]
})
export class ConfettiComponentComponent implements  AfterViewInit, OnDestroy {
  @ViewChild('confettiCanvas') confettiCanvasRef!: ElementRef<HTMLCanvasElement>;
  private canvas!: HTMLCanvasElement | null;
  private context!: CanvasRenderingContext2D | null;
  private particles: ConfettiParticle[] = [];
  private maxConfettis = 25;
  private possibleColors = ["#ff7336", "#f9e038", "#02cca4", "#383082", "#fed3f5", "#b1245a", "#f2733f"];
  private animationFrameId!: number;

  ngAfterViewInit() {
    this.initializeCanvas();
    this.createParticles();
    this.draw();
    this.handleResizeEvent();
    
    
    
  }

  ngOnDestroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private initializeCanvas() {
    this.canvas = this.confettiCanvasRef?.nativeElement;
    this.context = this.canvas?.getContext('2d');
    if (!this.canvas || !this.context) {
      console.error('Canvas or context is undefined.');
      return;
    }
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
  }

  private createParticles() {
    for (let i = 0; i < this.maxConfettis; i++) {
      this.particles.push(new ConfettiParticle(this.canvas!.width, this.canvas!.height, this.possibleColors, this.context!));
    }
  }

  private draw() {
    this.animationFrameId = requestAnimationFrame(() => this.draw());
    this.context?.clearRect(0, 0, this.canvas!.width, this.canvas!.height);

    for (const particle of this.particles) {
      particle.draw();
      particle.update();

      if (particle.isOutOfView(this.canvas!.width, this.canvas!.height)) {
        particle.resetPosition(this.canvas!.width, this.canvas!.height);
      }
    }
  }

  private handleResizeEvent() {
    window.addEventListener('resize', () => {
      this.canvas!.width = this.canvas!.offsetWidth;
      this.canvas!.height = this.canvas!.offsetHeight;

      // Reset particle positions on resize
      for (const particle of this.particles) {
        particle.resetPosition(this.canvas!.width, this.canvas!.height);
      }
    });
  }
}

class ConfettiParticle {
  x!: number;
  y!: number;
  r!: number;
  d!: number;
  color!: string;
  tilt!: number;
  tiltAngleIncremental!: number;
  tiltAngle!: number;

  constructor(private W: number, private H: number, private possibleColors: string[], private context: CanvasRenderingContext2D) {
    this.resetPosition(W, H);
  }

  draw() {
    this.context.beginPath();
    this.context.lineWidth = this.r / 2;
    this.context.strokeStyle = this.color;
    this.context.moveTo(this.x + this.tilt + this.r / 3, this.y);
    this.context.lineTo(this.x + this.tilt, this.y + this.tilt + this.r / 5);
    return this.context.stroke();
  }

  update() {
    this.tiltAngle += this.tiltAngleIncremental;
    this.y += (Math.cos(this.d) + 3 + this.r / 2) / 4; 
    this.tilt = Math.sin(this.tiltAngle - this.x / 3) * 10; 
  }

  isOutOfView(W: number, H: number): boolean {
    return this.x > W + 30 || this.x < -30 || this.y > H;
  }

  resetPosition(W: number, H: number) {
    this.x = Math.random() * W;
    this.y = Math.random() * H - H;
    this.r = this.randomFromTo(11, 33);
    this.d = Math.random() * 25 + 11;
    this.color = this.possibleColors[Math.floor(Math.random() * this.possibleColors.length)];
    this.tilt = Math.floor(Math.random() * 33) - 11;
    this.tiltAngleIncremental = Math.random() * 0.07 + 0.05;
    this.tiltAngle = 0;
  }

  private randomFromTo(from: number, to: number): number {
    return Math.floor(Math.random() * (to - from + 1) + from);
  }
}
