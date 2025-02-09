import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { BvnDto, NinDto, PersonalInfoDto, RegisterDto, TransactionPinDto } from "./dto";
import { SignInDto } from "./dto/sign-in.dto";

@Controller('auth')
export class AuthController {
     constructor(private authService: AuthService){}

     @Post('login')
     async login(@Body() dto: SignInDto){
        return this.authService.login(dto);
     }

     @Post('register')
     async register(@Body() dto: RegisterDto){
        return this.authService.register(dto);
     }

     @Post('save-personal-info')
     async savePersonalInfo(@Body() dto: PersonalInfoDto){
      return this.authService.setPersonalInfo(dto);
     }

     @Post('validate-bvn')
     async enterBvn(@Body() dto: BvnDto){
      return this.authService.setBvn(dto);
     }

     @Post('validate-nin')
     async enterNin(@Body() dto: NinDto){
      return this.authService.setNin(dto);
     }
     
     @Post('save-transaction-pin')
     async saveTransactionPin(@Body() dto: TransactionPinDto){
      return this.authService.setTransactionPin(dto);
     }
}