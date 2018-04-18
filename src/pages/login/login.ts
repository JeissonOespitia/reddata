import { Component } from '@angular/core';
import { NavController, NavParams, ToastController } from 'ionic-angular';
import { FormBuilder, Validators } from '@angular/forms';

@Component({
  selector: 'page-login',
  templateUrl: 'login.html',
})
export class LoginPage {

  private loginForm;

  constructor(
    public navCtrl: NavController,
    public formBuilder: FormBuilder,
    public navParams: NavParams,
    private toast: ToastController
  ) {
    this.ionViewDidLoad();
  }

  ionViewDidLoad() {
    this.loginForm = this.formBuilder.group({
      username: ['', Validators.required],
      password: ['', Validators.required],
    });
  }

  toastMessage(message: string, duration: number = 3000) {
    this.toast.create({
        message: message,
        duration: duration
    }).present();
}

  sendLogin(){

    this.toastMessage('Iniciando Session');

    
    let body = {
        username: this.loginForm.value.username,
        password: this.loginForm.value.password,
    };
    let pass = this.loginForm.value.password;
    if ( pass == 123){
      console.log('los campos son ', pass);
    }
    
  }

}
